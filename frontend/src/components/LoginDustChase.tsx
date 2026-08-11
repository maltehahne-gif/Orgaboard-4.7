import animatedScene from '../assets/dustin-chase-animated-v8.webp'

export function LoginDustChase() {
  return (
    <div
      className="dustin-v8-scene"
      aria-hidden="true"
    >
      <img
        className="dustin-v8-animation"
        src={animatedScene}
        alt=""
        draggable="false"
      />

      <div className="dustin-v8-readable-area" />
      <div className="dustin-v8-vignette" />
      <div className="dustin-v8-floor-glow" />

      <div className="dustin-v8-extra-dust">
        <i/><i/><i/><i/><i/><i/>
        <i/><i/><i/><i/><i/><i/>
        <i/><i/><i/><i/><i/><i/>
      </div>
    </div>
  )
}

export default LoginDustChase
