import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Head } from 'vite-react-ssg'
import {
  MonitorUp,
  Sparkles,
  SlidersHorizontal,
  CircleDot,
  Captions,
  Video,
  ArrowRight,
  Copy,
  Play,
  type LucideIcon,
} from 'lucide-react'

import favicon from '../../assets/favicon.svg'
import { AnimatedMediaLogo } from '../../components/media-logo/MediaLogo'
import styles from './HomePage.module.scss'
import { makeCn } from '../../utils/makeCn'

const cn = makeCn('HomePage', styles)

const GITHUB_URL = 'https://github.com/Vlad92msk/valm-js'
const NPM_URL = 'https://www.npmjs.com/package/valm-js'
const INSTALL_CMD = 'yarn add valm-js'

const GithubIcon = ({ size = 19 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden="true">
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.05.78 2.12v3.14c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
  </svg>
)

interface FeatureMeta {
  icon: LucideIcon
  slug: string
  pkg: string
}

// Иконка / целевой раздел / пакет для каждой карточки. Тексты — из i18n (по индексу).
const FEATURES: FeatureMeta[] = [
  { icon: MonitorUp, slug: 'screen-share', pkg: 'valm-js' },
  { icon: Sparkles, slug: 'effects', pkg: 'valm-js/effects' },
  { icon: SlidersHorizontal, slug: 'devices', pkg: 'valm-js' },
  { icon: CircleDot, slug: 'recording', pkg: 'valm-js' },
  { icon: Captions, slug: 'transcription', pkg: 'valm-js' },
  { icon: Video, slug: 'camera', pkg: 'valm-js' },
]

// Раскладка «веером»: поворот/подъём, порядок наложения и наезд карточек.
const FAN = [
  { rest: 'rotate(-12deg) translateY(-2px)', z: 2, ml: 0 },
  { rest: 'rotate(-7deg) translateY(9px)', z: 4, ml: -66 },
  { rest: 'rotate(-1.5deg) translateY(-10px) scale(1.04)', z: 9, ml: -66, hl: true },
  { rest: 'rotate(3.5deg) translateY(10px)', z: 5, ml: -66 },
  { rest: 'rotate(8deg) translateY(6px)', z: 3, ml: -66 },
  { rest: 'rotate(12.5deg) translateY(-2px)', z: 1, ml: -66 },
]

interface FeatureText {
  tag: string
  title: string
  desc: string
}

const handleCardEnter = (e: MouseEvent<HTMLElement>) => {
  const el = e.currentTarget
  el.style.transform = `${el.dataset.rest ?? ''} scale(1.08)`
  el.style.zIndex = '60'
  el.style.borderColor = 'var(--accent-blue)'
}

const handleCardLeave = (e: MouseEvent<HTMLElement>) => {
  const el = e.currentTarget
  el.style.transform = el.dataset.rest ?? ''
  el.style.zIndex = el.dataset.z ?? ''
  el.style.borderColor = ''
}

const HomePage = () => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const badges = t('home.hero.badges', { returnObjects: true }) as string[]
  const features = t('home.features', { returnObjects: true }) as FeatureText[]

  const handleCopyInstall = () => {
    navigator.clipboard?.writeText(INSTALL_CMD)
    setCopied(true)
    setTimeout(() => setCopied(false), 1100)
  }

  return (
    <div className={cn()}>
      <Head>
        <title>valm — all your media work in one API</title>
        <link rel="canonical" href="https://valm-js.web.app/" />
      </Head>

      {/* ── Hero ───────────────────────────────────────────── */}
      <header className={cn('hero')}>
        <div className={cn('heroInner')}>
          <div className={cn('heroLeft')}>
            <span className={cn('heroBadge')}>
              <span className={cn('heroBadgeDot')} />
              {t('home.hero.badge')}
            </span>
            <h1 className={cn('title')}>
              {t('home.hero.titleLead')}&nbsp;
              <span className={cn('titleAccent')}>{t('home.hero.titleAccent')}</span>
            </h1>
            <p className={cn('subtitle')}>{t('home.hero.subtitle')}</p>
            <div className={cn('heroActions')}>
              <Link to="/docs/getting-started" className={cn('btnPrimary')}>
                {t('home.hero.readDocs')}
                <ArrowRight size={18} />
              </Link>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={cn('btnSecondary')}>
                <GithubIcon size={19} />
                {t('home.hero.github')}
              </a>
            </div>
            <div className={cn('badges')}>
              {badges.map((badge) => (
                <span key={badge} className={cn('badge')}>{badge}</span>
              ))}
            </div>
          </div>

          <div className={cn('heroArtWrap')}>
            <AnimatedMediaLogo className={cn('heroArt')} strokeWidth={2} blink={true} />
          </div>
        </div>
      </header>

      {/* ── Почему VALM ────────────────────────────────────── */}
      <section className={cn('why')}>
        <div className={cn('whyInner')}>
          <div className={cn('whyOverline')}>{t('home.why.overline')}</div>
          <h2 className={cn('whyTitle')}>{t('home.why.title')}</h2>
          <p className={cn('whyText')}>{t('home.why.text')}</p>
        </div>
      </section>

      {/* ── Веер карточек возможностей ─────────────────────── */}
      <section className={cn('fan')}>
        <div className={cn('fanRow')}>
          <div className={cn('fanTrack')}>
            {FEATURES.map((meta, i) => {
              const fan = FAN[i]
              const text = features[i]
              const Icon = meta.icon
              return (
                <article
                  key={meta.slug}
                  className={cn('card', { hl: fan.hl })}
                  data-rest={fan.rest}
                  data-z={String(fan.z)}
                  onMouseEnter={handleCardEnter}
                  onMouseLeave={handleCardLeave}
                  style={{ transform: fan.rest, zIndex: fan.z, marginLeft: fan.ml }}
                >
                  <div className={cn('cardIcon')}>
                    <Icon size={23} />
                  </div>
                  <div className={cn('cardTag')}>{text.tag}</div>
                  <h3 className={cn('cardTitle')}>{text.title}</h3>
                  <p className={cn('cardDesc')}>{text.desc}</p>
                  <div className={cn('cardFoot')}>
                    <code className={cn('cardPkg')}>{meta.pkg}</code>
                    <Link to={`/docs/${meta.slug}`} className={cn('cardDocs')}>
                      {t('home.fan.docs')}
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Финальный CTA ──────────────────────────────────── */}
      <section className={cn('cta')}>
        <div className={cn('ctaCard')}>
          <div className={cn('ctaGlow')} />
          <div className={cn('ctaContent')}>
            <h2 className={cn('ctaTitle')}>{t('home.cta.title')}</h2>
            <p className={cn('ctaText')}>{t('home.cta.text')}</p>
            <div className={cn('install')}>
              <code className={cn('installCmd')}>
                {INSTALL_CMD}
              </code>
              <button
                type="button"
                className={cn('installBtn', { copied })}
                onClick={handleCopyInstall}
                aria-label="Copy install command"
              >
                <Copy size={17} />
              </button>
            </div>
            <div className={cn('ctaActions')}>
              <Link to="/docs/getting-started" className={cn('btnPrimary')}>
                {t('home.cta.gettingStarted')}
                <ArrowRight size={18} />
              </Link>
              <Link to="/playground" className={cn('btnSecondary')}>
                <Play size={17} />
                {t('home.cta.openPlayground')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Футер ──────────────────────────────────────────── */}
      <footer className={cn('footer')}>
        <div className={cn('footerInner')}>
          <div className={cn('footerBrand')}>
            <img src={favicon} alt="" width={26} height={26} />
            <span className={cn('footerName')}>VALM</span>
          </div>
          <div className={cn('footerLinks')}>
            <Link to="/docs/getting-started" className={cn('footerLink')}>{t('home.footer.docs')}</Link>
            <Link to="/playground" className={cn('footerLink')}>{t('home.footer.playground')}</Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={cn('footerLink')}>GitHub</a>
            <a href={NPM_URL} target="_blank" rel="noopener noreferrer" className={cn('footerLink')}>npm</a>
            <span className={cn('footerRights')}>{t('home.footer.rights')}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
