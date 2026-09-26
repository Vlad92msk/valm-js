// Общие части Audio/VideoTrackManager

// 'replaced' — трек фактически получен/заменён; 'noop' — уже на этом устройстве;
// 'disabled' — трек выключен, менять нечего; 'superseded' — операцию вытеснил более новый вызов
export type SwitchOutcome = 'replaced' | 'noop' | 'disabled' | 'superseded'

export interface TrackDeviceInfo {
  deviceId: string | null
  groupId: string | null
  label: string
}

export function describeTrackDevice(track: MediaStreamTrack): TrackDeviceInfo {
  const settings = track.getSettings()
  return { deviceId: settings.deviceId ?? null, groupId: settings.groupId ?? null, label: track.label }
}

export interface ExclusiveState {
  pending: Promise<SwitchOutcome> | null
  abortController: AbortController | null
}

// Сериализует мутирующие операции над треком: отменяет предыдущую in-flight операцию и ждёт
// её завершения, затем выполняет свою под собственным AbortController. Отменённая операция
// (AbortError) завершается тихо — без ERROR-события и без осевших живых треков — и резолвится 'superseded'.
export async function runExclusiveOperation(
  state: ExclusiveState,
  operation: (abortController: AbortController) => Promise<SwitchOutcome>,
  onDone: VoidFunction,
): Promise<SwitchOutcome> {
  // Захватываем предыдущую операцию и отменяем её — синхронно, чтобы конкурентные
  // вызовы выстроились в корректную цепочку (каждый отменяет ровно предшественника)
  const previous = state.pending
  state.abortController?.abort()

  const currentAbortController = new AbortController()
  state.abortController = currentAbortController

  const operationPromise = (async (): Promise<SwitchOutcome> => {
    // Ждём завершения предыдущей операции (её ошибку обрабатывает её собственный вызов)
    if (previous) {
      await previous.catch(() => {})
    }

    let outcome: SwitchOutcome
    try {
      outcome = await operation(currentAbortController)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'superseded'
      }
      throw error
    } finally {
      if (state.abortController === currentAbortController) {
        state.abortController = null
      }
    }

    onDone()
    return outcome
  })()

  state.pending = operationPromise

  try {
    return await operationPromise
  } finally {
    if (state.pending === operationPromise) {
      state.pending = null
    }
  }
}

export function toSwitchResult(outcome: SwitchOutcome, deviceId: string | null): { applied: boolean; deviceId: string | null; reason?: 'noop' | 'superseded' | 'disabled' } {
  return outcome === 'replaced' ? { applied: true, deviceId } : { applied: false, deviceId, reason: outcome }
}

// Сообщает о track.muted с задержкой: при смене BT-профиля mute→unmute приходит за сотни мс,
// и такие «мигания» не должны доходить до UI. unmute отправляется, только если был отправлен mute
export class SourceMuteReporter {
  private timer: ReturnType<typeof setTimeout> | null = null
  private reported = false

  constructor(
    private getDelay: () => number,
    private emit: (muted: boolean) => void,
  ) {}

  get isMuted(): boolean {
    return this.reported
  }

  update(muted: boolean): void {
    this.cancel()
    if (!muted) {
      if (this.reported) {
        this.reported = false
        this.emit(false)
      }
      return
    }
    if (this.reported) return

    const fire = () => {
      this.timer = null
      this.reported = true
      this.emit(true)
    }
    const delay = this.getDelay()
    if (delay > 0) this.timer = setTimeout(fire, delay)
    else fire()
  }

  // Трек сменился или выключен: сбросить без событий
  reset(): void {
    this.cancel()
    this.reported = false
  }

  private cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
