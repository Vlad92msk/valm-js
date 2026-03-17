import { Link } from 'react-router-dom'

import styles from './HomePage.module.scss'
import { makeCn } from '../../utils/makeCn'

const cn = makeCn('HomePage', styles)

const FEATURES = [
  { icon: '🎥', title: 'Камера и микрофон', desc: 'Запустите камеру и микрофон буквально в одну строку. Мьют, переключение между устройствами, предпросмотр — всё работает из коробки.' },
  { icon: '🖥️', title: 'Захват экрана', desc: 'Дайте пользователям возможность показать свой экран, окно или вкладку. Разрешение, FPS и режим отображения — настраивается под ваши нужды.' },
  { icon: '🎨', title: 'Видеоэффекты', desc: 'Размытие фона и виртуальные фоны — как в Google Meet, только в вашем приложении. Плюс поддержка собственных ML-эффектов через кастомный пайплайн.' },
  { icon: '📱', title: 'Управление устройствами', desc: 'Список всех камер и микрофонов, отслеживание подключения и отключения в реальном времени, смена устройства без перезапуска стрима.' },
  { icon: '🎙️', title: 'Запись', desc: 'Записывайте видео и аудио прямо в браузере — с паузой, готовыми пресетами качества и автосохранением по таймеру или размеру файла.' },
  { icon: '💬', title: 'Транскрипция', desc: 'Речь в текст в реальном времени. Субтитры, автоматические записи встреч, голосовые команды — доступны с первых строк, без сторонних сервисов.' },
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
        <p className={cn('featuresSubtitle')}>
          Стройте видеоконференции, мессенджеры и трансляции, не погружаясь в низкоуровневые детали MediaStream API.
          VALM берёт на себя всю работу с медиа — вам остаётся только использовать результат.
        </p>
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
