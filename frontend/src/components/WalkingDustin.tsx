import dustinImg from '../assets/dustin-standalone.png'

export function WalkingDustin() {
  return (
    <div className="login-walking-dustin" aria-hidden="true">
      <div className="walking-dustin-track">
        <div className="walking-dustin-figure">
          <div className="walking-dustin-shadow" />

          <div className="walking-dustin-leg walking-dustin-leg-left">
            <img src={dustinImg} alt="" />
          </div>

          <div className="walking-dustin-leg walking-dustin-leg-right">
            <img src={dustinImg} alt="" />
          </div>

          <div className="walking-dustin-torso">
            <img src={dustinImg} alt="" />
          </div>
        </div>
      </div>
    </div>
  )
}
