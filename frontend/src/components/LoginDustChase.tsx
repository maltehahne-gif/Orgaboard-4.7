import {useEffect, useRef, useState} from 'react'
import dustinVideo from '../assets/dustin-chase.mp4'
import dustinPoster from '../assets/dustin-chase-poster.webp'

/**
 * Die Anmeldeszene: Dustin fegt die Staubmonster vor sich her.
 *
 * Rein dekorativ. Diese Komponente kennt weder Formular noch Anmeldung, hat
 * keinen Zugriff auf deren Zustand und liegt hinter der Karte - sie kann
 * nichts blockieren und nichts abfangen.
 *
 * Warum ein Video und kein WebGL/Three.js/Sprite-Sheet:
 *
 * Die Figur liegt als fertig gerenderte 48-Bild-Animation vor
 * (dustin-chase-animated-v8.webp, 4,8 MB). Jede Nachbildung in Code - SVG,
 * Canvas, ein 3D-Modell - waere eine neue Figur, die der Vorlage nur
 * aehnelt. Die echten Einzelbilder sind der einzige Weg, bei dem Fell,
 * Gesicht, Hoodie und Staubsauger exakt die der Vorlage bleiben. Als H.264
 * bleiben davon 411 kB statt 4,8 MB, das Bild wird von der Grafikeinheit
 * dekodiert, und die Wiedergabe laesst sich steuern.
 *
 * Die Bildfolge selbst ist ein Laufzyklus an Ort und Stelle: Beine, Arme,
 * Koerper, Kleidung und Staubsauger bewegen sich darin echt. Das
 * Herankommen aus der Tiefe entsteht durch die Kamerafahrt darueber -
 * dieselbe Aufteilung wie in einer richtigen Produktion, wo eine Figur den
 * Laufzyklus abspielt und die Kamera die Strecke macht.
 */

/**
 * Dauer der Anfahrt. Danach wechselt die Szene in den ruhigen Zustand.
 *
 * Muss zur Kamerafahrt in styles.css passen (--dustin-anfahrt, 4s). Die
 * 200 ms Zugabe sorgen dafuer, dass die Fahrt sichtbar ausgelaufen ist,
 * bevor der ruhige Zustand uebernimmt.
 */
const ANFAHRT_MS = 4200

/** Tempo im Ruhezustand - deutlich langsamer, aber nicht eingefroren. */
const RUHE_TEMPO = 0.3

export function LoginDustChase() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [phase, setPhase] = useState<'anfahrt' | 'ruhe'>('anfahrt')
  const [ruhig, setRuhig] = useState(false)

  // Wer Bewegung reduziert haben moechte, bekommt das Standbild.
  useEffect(() => {
    const abfrage = window.matchMedia('(prefers-reduced-motion: reduce)')
    const setzen = () => setRuhig(abfrage.matches)
    setzen()
    abfrage.addEventListener('change', setzen)
    return () => abfrage.removeEventListener('change', setzen)
  }, [])

  useEffect(() => {
    if (ruhig) return
    const zeitgeber = window.setTimeout(() => setPhase('ruhe'), ANFAHRT_MS)
    return () => window.clearTimeout(zeitgeber)
  }, [ruhig])

  // Im Ruhezustand laeuft die Figur weiter, nur viel langsamer. Ein
  // stehendes Standbild wirkt an dieser Stelle wie ein Ladefehler.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = phase === 'ruhe' ? RUHE_TEMPO : 1
  }, [phase])

  useEffect(() => {
    const video = videoRef.current
    if (!video || ruhig) return
    // Manche Browser lehnen das selbsttaetige Abspielen ab. Dann bleibt das
    // Standbild stehen - das ist kein Fehlerfall, nur weniger Bewegung.
    video.play().catch(() => {})
  }, [ruhig])

  return (
    <div
      className={`dustin-scene dustin-scene-${phase}${ruhig ? ' is-still' : ''}`}
      aria-hidden="true"
    >
      {/* Hintergrundebenen. Sie bewegen sich langsamer als die Figur und
          geben der Anfahrt damit Tiefe. */}
      <div className="dustin-layer dustin-layer-back" />
      <div className="dustin-layer dustin-layer-mid" />

      {/* Haengelampe rechts oben - die warme Lichtquelle aus der Vorlage. */}
      <div className="dustin-lampe" />

      {/* Die Buehne gibt die Perspektive vor, die Kamera faehrt darin nach
          vorn, und erst darin sitzt das Bild. Der gruene Schein des
          Staubsaugers liegt mit im Kamerakasten - so bleibt er waehrend
          der ganzen Fahrt an der Duese. */}
      <div className="dustin-stage">
        <div className="dustin-camera">
          <div className="dustin-breath">
            {ruhig ? (
              <img src={dustinPoster} alt="" className="dustin-media" draggable="false" />
            ) : (
              <video
                ref={videoRef}
                className="dustin-media"
                src={dustinVideo}
                poster={dustinPoster}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                tabIndex={-1}
              />
            )}
            <div className="dustin-beam" />
          </div>
        </div>
      </div>

      {/*
        Der Schriftzug an der Wand. Er steht im Baum nach der Figur, weil das
        Bildmaterial einen eigenen dunklen Hintergrund mitbringt und ihn sonst
        verdeckt. Er sitzt rechts aussen, wo die Figur nicht hinreicht - dort
        liest er sich als das, was er sein soll: Leuchtschrift an der Wand
        dahinter.
      */}
      <div className="dustin-wand">
        <span className="dustin-wand-marke" />
        <span>Ordnung.</span>
        <span>Struktur.</span>
        <span>Erfolg.</span>
      </div>

      {/* Licht, das der Staubsauger auf den Boden wirft. */}
      <div className="dustin-floor-glow" />

      {/* Staub, der an der Kamera vorbeizieht. Waehrend der Anfahrt schnell,
          danach nur noch ein leichtes Schweben. */}
      <div className="dustin-motes">
        {Array.from({length: 14}, (_, i) => (
          <i key={i} style={{'--i': i} as React.CSSProperties} />
        ))}
      </div>

      {/* Weicher Übergang zur Karte, damit links keine harte Kante steht. */}
      <div className="dustin-fade" />
    </div>
  )
}

export default LoginDustChase
