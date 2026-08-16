// Als WebP und auf 512 px verkleinert: Angezeigt wird die Grafik mit 205 px
// (145 px auf dem Telefon), ausgeliefert wurde sie mit 1536 px und 2,4 MB -
// das Vielfache des gesamten uebrigen Programmcodes, und das ausgerechnet
// auf der Anmeldeseite, die im Aussendienst ueber Mobilfunk laedt.
import dustinScene from '../assets/dustin-chase-scene.webp'

export function LoginDustChase() {
  return (
    <div className="v7-login-scene" aria-hidden="true">

      <div className="v7-scene-picture">
        <img
          src={dustinScene}
          alt=""
          draggable="false"
        />
      </div>

      <div className="v7-left-softener" />

      <div className="v7-floor-glow" />

      <div className="v7-floating-dust">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>

    </div>
  )
}

export default LoginDustChase
