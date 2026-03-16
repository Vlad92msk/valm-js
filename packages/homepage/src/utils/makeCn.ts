import { ClassNameList, withNaming } from '@bem-react/classname'
import { ClassValue, clsx } from 'clsx'

export declare interface IStyles {
  [className: string]: string
}

declare type ElemMixType = ClassNameList

const makeClassNameMaker = withNaming({ e: '-', m: '--', v: '_' })

export function classNames(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export const makeCn = (scopeName: string, styles: IStyles) => {
  const makeClassName = makeClassNameMaker(scopeName)

  return (elemNameOrBlockMods?: any, elemModsOrBlockMix?: any, elemMix?: ElemMixType) => {
    const classNames = makeClassName(elemNameOrBlockMods, elemModsOrBlockMix, elemMix).split(' ')

    return classNames.reduce((acc, className) => {
      const scopedClassName = styles[className]
      return scopedClassName ? `${acc} ${scopedClassName}` : acc
    }, '')
  }
}

// Example:
//     import style from './CentralArea.module.scss'
// export const cn = makeCn('CentralArea', style)
//
//     <div className={cn({ fullScreen: showFullScreen })}>
// <div className={cn('ParticipantsList', { fullScreen: showFullScreen })}>
// <div  className={cn('Card', {
//   isSpeaking,
//       participantType: 'screen',
// })}>...</div>
// //...
// </div>
// </div>
//
//     .CentralArea {
//
// &--fullScreen {
//     padding: 0;
//     height: 100%;
//     max-width: 100dvw;
//     max-height: 100dvh;
//   }
//
// &-Card {
// //...
//
//   &--participantType {
//     &_screen {
//  //...
//       }
//     }
//
//   &--isSpeaking {
// //...
//     }
//   }
// }
