import { Link } from 'react-router-dom'

import styles from './HomePage.module.scss'
import { makeCn } from '../../utils/makeCn'

const cn = makeCn('HomePage', styles)

const FEATURES = [
  { icon: '🎥', title: 'Камера и микрофон', desc: 'Включение, отключение, мьют, переключение устройств и предпросмотр — полный контроль над видео и аудио' },
  { icon: '🖥️', title: 'Захват экрана', desc: 'Трансляция экрана, окна или вкладки с настройкой разрешения, частоты кадров и подсказок контента' },
  { icon: '🎨', title: 'Видеоэффекты', desc: 'Размытие фона, виртуальные фоны и кастомный пайплайн эффектов через MediaPipe' },
  { icon: '📱', title: 'Управление устройствами', desc: 'Перечисление устройств, отслеживание подключений, смена камеры и микрофона на лету' },
  { icon: '🎙️', title: 'Запись', desc: 'Запись медиа с пресетами качества, паузой, ограничением размера и автосохранением' },
  { icon: '💬', title: 'Транскрипция', desc: 'Распознавание речи в реальном времени через Web Speech API с поддержкой нескольких языков' },
]

const handleScrollToFeatures = () => {
  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
}

const HomePage = () => {
  return (
    <div className={cn()}>
      <section className={cn('hero')}>
     <h1 className={cn('title')}>Video Audio Local Management</h1>
        <p className={cn('subtitle')}>
          Framework-agnostic media management for the web
        </p>
        <div className={cn('actions')}>
          <Link to="/docs/getting-started" className={cn('btn', { variant: 'primary' })}>
            Documentation
          </Link>
          <Link to="/playground" className={cn('btn', { variant: 'outline' })}>
            Playground
          </Link>
        </div>
        <button
          type="button"
          className={cn('scrollBtn')}
          onClick={handleScrollToFeatures}
          aria-label="Прокрутить к возможностям"
        >
          ↓
        </button>
      </section>

      <section id="features" className={cn('features')}>
        <h2 className={cn('featuresTitle')}>Почему VALM?</h2>
        <div className={cn('grid')}>
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} className={cn('card')}>
             <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}> <span className={cn('cardIcon')}>{icon}</span>
               <h3 className={cn('cardTitle')}>{title}</h3></div>
              <p className={cn('cardDesc')}>{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default HomePage
