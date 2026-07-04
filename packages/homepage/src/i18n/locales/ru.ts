// Русская локаль (по умолчанию). Ключи сгруппированы по зонам интерфейса.
const ru = {
  nav: {
    home: 'Главная',
    docs: 'Документация',
    playground: 'Playground',
  },
  header: {
    github: 'GitHub',
    playgroundCta: 'Playground',
  },
  sidebar: {
    groups: {
      start: 'Начало работы',
      core: 'Core',
      effects: 'Effects',
      advanced: 'Advanced',
    },
  },
  docs: {
    loading: 'Загрузка…',
    notFound: 'Страница не найдена.',
    openNav: 'Открыть навигацию',
    backHome: 'На главную',
    openPlayground: 'Открыть Playground',
    copy: 'Copy',
    copied: 'Copied!',
    copyAria: 'Копировать код',
  },
  playground: {
    placeholder: 'Включите камеру или показ экрана',
    sourceCamera: 'Camera',
    sourceScreen: 'Screen',
    transcription: 'Транскрипция',
    closeError: 'Закрыть',
    recording: {
      ready: 'Готов к записи',
      active: 'Идёт запись',
      paused: 'На паузе',
      record: 'Запись',
      stop: 'Стоп',
      needSource: 'Включите камеру или микрофон на вкладке Devices',
    },
  },
  home: {
    hero: {
      badge: 'valm-js',
      titleLead: 'Вся работа с медиа',
      titleAccent: 'в одном API.',
      subtitle:
        'Камера, экран, эффекты, запись и транскрипция — единый framework-agnostic слой поверх MediaStream.',
      readDocs: 'Читать документацию',
      github: 'GitHub',
      badges: ['TypeScript-first', 'framework-agnostic', 'zero deps'],
    },
    why: {
      overline: 'Почему VALM',
      title: 'Медиа без низкоуровневой возни',
      text: 'Стройте видеоконференции, мессенджеры и трансляции, не погружаясь в низкоуровневые детали MediaStream API.',
    },
    fan: {
      hint: 'наведите на карточку',
      docs: 'Docs',
    },
    features: [
      {
        tag: 'core · screen-share',
        title: 'Захват экрана',
        desc: 'Дайте пользователям показать экран, окно или вкладку. Разрешение, FPS и режим отображения настраиваются под ваши нужды.',
      },
      {
        tag: 'effects',
        title: 'Видеоэффекты',
        desc: 'Размытие фона и виртуальные фоны — как в Google Meet, только в вашем приложении. Плюс собственные ML-эффекты через кастомный пайплайн.',
      },
      {
        tag: 'core · devices',
        title: 'Управление устройствами',
        desc: 'Список всех камер и микрофонов, отслеживание подключения в реальном времени, смена устройства без перезапуска стрима.',
      },
      {
        tag: 'advanced · recording',
        title: 'Запись',
        desc: 'Записывайте видео и аудио прямо в браузере — с паузой, пресетами качества и автосохранением по таймеру или размеру файла.',
      },
      {
        tag: 'advanced · transcription',
        title: 'Транскрипция',
        desc: 'Речь в текст в реальном времени. Субтитры, автозаписи встреч, голосовые команды — доступны с первых строк, без сторонних сервисов.',
      },
      {
        tag: 'core · camera',
        title: 'Камера и микрофон',
        desc: 'Запустите камеру и микрофон буквально в одну строку. Мьют, переключение между устройствами, предпросмотр — всё работает из коробки.',
      },
    ],
    cta: {
      title: 'Начните с одной строки',
      text: 'Установите пакет и запустите камеру за минуту. Остальное — в документации.',
      gettingStarted: 'Getting started',
      openPlayground: 'Open playground',
    },
    footer: {
      docs: 'Документация',
      playground: 'Playground',
      rights: 'MIT © 2026 valm-js',
    },
  },
}

export default ru
export type Resources = typeof ru
