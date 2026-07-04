import type { Resources } from './ru'

// Английская локаль. Структура совпадает с ru (типизируется по Resources).
const en: Resources = {
  nav: {
    home: 'Home',
    docs: 'Documentation',
    playground: 'Playground',
  },
  header: {
    github: 'GitHub',
    playgroundCta: 'Playground',
  },
  sidebar: {
    groups: {
      start: 'Getting Started',
      core: 'Core',
      effects: 'Effects',
      advanced: 'Advanced',
    },
  },
  docs: {
    loading: 'Loading…',
    notFound: 'Page not found.',
    openNav: 'Open navigation',
    backHome: 'Back to home',
    openPlayground: 'Open Playground',
    copy: 'Copy',
    copied: 'Copied!',
    copyAria: 'Copy code',
  },
  playground: {
    placeholder: 'Enable camera or screen share',
    sourceCamera: 'Camera',
    sourceScreen: 'Screen',
    transcription: 'Transcription',
    closeError: 'Close',
    recording: {
      ready: 'Ready to record',
      active: 'Recording',
      paused: 'Paused',
      record: 'Record',
      stop: 'Stop',
      needSource: 'Enable the camera or microphone on the Devices tab',
    },
  },
  home: {
    hero: {
      badge: 'valm-js',
      titleLead: 'All your media work',
      titleAccent: 'in one API.',
      subtitle:
        'Camera, screen, effects, recording and transcription — a single framework-agnostic layer over MediaStream.',
      readDocs: 'Read the docs',
      github: 'GitHub',
      badges: ['TypeScript-first', 'framework-agnostic', 'zero deps'],
    },
    why: {
      overline: 'Why VALM',
      title: 'Media without the low-level hassle',
      text: 'Build video conferencing, messengers and broadcasts without diving into the low-level details of the MediaStream API.',
    },
    fan: {
      hint: 'hover over a card',
      docs: 'Docs',
    },
    features: [
      {
        tag: 'core · screen-share',
        title: 'Screen capture',
        desc: 'Let users share their screen, a window or a tab. Resolution, FPS and display surface are all configurable to your needs.',
      },
      {
        tag: 'effects',
        title: 'Video effects',
        desc: 'Background blur and virtual backgrounds — just like Google Meet, but in your own app. Plus custom ML effects via a custom pipeline.',
      },
      {
        tag: 'core · devices',
        title: 'Device management',
        desc: 'List every camera and microphone, track connections in real time, switch devices without restarting the stream.',
      },
      {
        tag: 'advanced · recording',
        title: 'Recording',
        desc: 'Record video and audio right in the browser — with pause, quality presets and auto-save by timer or file size.',
      },
      {
        tag: 'advanced · transcription',
        title: 'Transcription',
        desc: 'Real-time speech to text. Captions, automatic meeting notes, voice commands — available from the first line, without third-party services.',
      },
      {
        tag: 'core · camera',
        title: 'Camera & microphone',
        desc: 'Start the camera and microphone in a single line. Mute, switching between devices, preview — everything works out of the box.',
      },
    ],
    cta: {
      title: 'Start with a single line',
      text: 'Install the package and start the camera in a minute. Everything else is in the docs.',
      gettingStarted: 'Getting started',
      openPlayground: 'Open playground',
    },
    footer: {
      docs: 'Documentation',
      playground: 'Playground',
      rights: 'MIT © 2026 valm-js',
    },
  },
}

export default en
