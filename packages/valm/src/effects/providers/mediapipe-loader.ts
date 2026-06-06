export type TasksVisionModule = typeof import('@mediapipe/tasks-vision')

let modulePromise: Promise<TasksVisionModule> | null = null

// Лениво подгружает optional peer-зависимость @mediapipe/tasks-vision.
// Ядро (камера/микрофон/запись) не должно тянуть mediapipe в граф сборки —
// пакет нужен только когда реально включают видео-эффекты.
export function loadTasksVision(): Promise<TasksVisionModule> {
  if (!modulePromise) {
    modulePromise = import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */
      '@mediapipe/tasks-vision'
    ).catch((error) => {
      modulePromise = null
      throw new Error(
        'Для видео-эффектов нужен пакет "@mediapipe/tasks-vision". Установите его: npm install @mediapipe/tasks-vision',
        { cause: error },
      )
    })
  }

  return modulePromise
}
