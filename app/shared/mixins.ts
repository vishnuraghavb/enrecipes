declare const android: any
import { CoreTypes } from '@nativescript/core'
import { localize } from '@nativescript/localize'
const Intl = require('nativescript-intl')

export const myMixin = {
  methods: {
    mLoad({ object }) {
      object._dialogFragment
        .getDialog()
        .getWindow()
        .setBackgroundDrawable(
          new android.graphics.drawable.ColorDrawable(
            android.graphics.Color.TRANSPARENT
          )
        )
    },
    animateBar(obj, x: number, y?: number) {
      let c = CoreTypes.AnimationCurve
      if (y) obj.translateY = 64
      return obj.animate({
        opacity: 1,
        translate: { x: 0, y: x ? 0 : 64 },
        duration: 200,
        curve: x ? c.easeOut : c.easeIn,
      })
    },
    totalTime(prepTime, cookTime) {
      let t1 = prepTime.split(':')
      let t2 = cookTime.split(':')
      let minutes = parseInt(t1[1]) + parseInt(t2[1])
      let m = minutes % 60
      let h = parseInt(t1[0]) + parseInt(t2[0]) + Math.floor(minutes / 60)
      let hr = localize('hr')
      let min = localize('min')
      let mins = h * 60 + m
      h = h && this.getLocaleN(h)
      m = m && this.getLocaleN(m)
      return {
        time: h ? (m ? `${h} ${hr} ${m} ${min}` : `${h} ${hr}`) : `${m} ${min}`,
        duration: `${mins}`,
      }
    },
    setGravity(args) {
      ;(args.object || args).android.setGravity(this.RTL ? 5 : 3)
    },
    getLocaleN(n) {
      return new Intl.NumberFormat(null).format(Number(n))
    },
    touchFade(object, action) {
      let c = object.className
      object.className = action.match(/down|move/)
        ? !c.includes('fade')
          ? c + ' fade'
          : c
        : c.replace(/ fade/g, '')
    },
    swipeBack({ direction }, method) {
      if (this.$store.state.edgeSwipe)
        if (direction == 1) method ? method(0) : this.$navigateBack()
    },
  },
}
