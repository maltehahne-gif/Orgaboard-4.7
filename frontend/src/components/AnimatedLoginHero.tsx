import sceneImg from '../assets/login-scene.png'
import dustinImg from '../assets/dustin-standalone.png'

export function AnimatedLoginHero(){
  return (
    <div className="animated-login-hero" aria-hidden="true">
      <div className="animated-login-scene">
        <img src={sceneImg} alt="" />
      </div>

      <div className="animated-dustin-wrap">
        <img src={dustinImg} alt="" className="animated-dustin" />
      </div>
    </div>
  )
}
