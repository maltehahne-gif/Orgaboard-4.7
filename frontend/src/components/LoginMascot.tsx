import './LoginMascot.css'

export function LoginMascot(){
  return (
    <div className="login-mascot-stage" aria-hidden="true">
      <div className="login-mascot-bubble">
        Hallo! 👋
        <small>Zeit für etwas Ordnung.</small>
      </div>

      <svg
        className="login-dustin"
        viewBox="0 0 430 430"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="furGradient" cx="35%" cy="25%">
            <stop offset="0%" stopColor="#d98743"/>
            <stop offset="70%" stopColor="#ad5d2d"/>
            <stop offset="100%" stopColor="#7e3f21"/>
          </radialGradient>

          <linearGradient id="hoodieGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#128244"/>
            <stop offset="100%" stopColor="#064a2a"/>
          </linearGradient>

          <linearGradient id="vacuumWhite" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff"/>
            <stop offset="100%" stopColor="#d7dedb"/>
          </linearGradient>
        </defs>

        {/* Staubsauger */}
        <g className="login-vacuum">
          <path
            d="M88 322 C92 272 119 244 160 234"
            fill="none"
            stroke="#242a29"
            strokeWidth="14"
            strokeLinecap="round"
          />

          <g className="login-vacuum-body">
            <ellipse cx="69" cy="334" rx="51" ry="43" fill="url(#vacuumWhite)" stroke="#17352b" strokeWidth="5"/>
            <ellipse cx="43" cy="345" rx="19" ry="23" fill="#25302e"/>
            <ellipse cx="96" cy="345" rx="19" ry="23" fill="#25302e"/>
            <path d="M44 304 Q69 284 96 304 L92 326 Q69 337 46 326Z" fill="#0b7340"/>
            <circle cx="69" cy="314" r="8" fill="#40dc7b"/>
          </g>

          <g className="login-vacuum-wand">
            <line x1="163" y1="226" x2="269" y2="351" stroke="#ccd5d2" strokeWidth="16" strokeLinecap="round"/>
            <line x1="165" y1="226" x2="269" y2="351" stroke="#60706b" strokeWidth="4" strokeLinecap="round"/>
            <rect x="151" y="213" width="36" height="26" rx="10" fill="#183c30"/>
            <rect x="158" y="216" width="14" height="19" rx="5" fill="#39d876"/>

            <g className="login-vacuum-head">
              <rect x="244" y="343" width="106" height="35" rx="13" fill="#182523"/>
              <rect x="255" y="349" width="84" height="8" rx="4" fill="#36e47c"/>
              <rect x="262" y="362" width="70" height="7" rx="3" fill="#e7eeeb"/>
            </g>
          </g>
        </g>

        {/* Teddy */}
        <g className="login-dustin-body">

          {/* Beine */}
          <g className="login-leg login-leg-left">
            <rect x="174" y="294" width="57" height="92" rx="28" fill="url(#furGradient)" stroke="#763c20" strokeWidth="5"/>
            <ellipse cx="191" cy="384" rx="42" ry="25" fill="#b96b36" stroke="#763c20" strokeWidth="5"/>
          </g>

          <g className="login-leg login-leg-right">
            <rect x="239" y="294" width="57" height="92" rx="28" fill="url(#furGradient)" stroke="#763c20" strokeWidth="5"/>
            <ellipse cx="281" cy="384" rx="42" ry="25" fill="#b96b36" stroke="#763c20" strokeWidth="5"/>
          </g>

          {/* Körper / Hoodie */}
          <path
            d="M153 191
               Q175 170 205 168
               L259 168
               Q292 172 310 197
               L301 307
               Q265 326 223 326
               Q181 326 145 306Z"
            fill="url(#hoodieGradient)"
            stroke="#04351f"
            strokeWidth="6"
          />

          <line x1="228" y1="177" x2="228" y2="315" stroke="#49a66a" strokeWidth="4"/>
          <circle cx="228" cy="219" r="5" fill="#a7d9b7"/>

          <text x="245" y="236" fill="#ffffff" fontSize="17" fontWeight="700">
            DUSTIN
          </text>

          <text x="245" y="257" fill="#d6f5df" fontSize="11" fontWeight="700">
            ORGABOARD
          </text>

          {/* linker Arm hält Staubsauger */}
          <g className="login-arm-left">
            <path
              d="M165 204 Q135 210 131 244 Q137 263 159 255 L181 230"
              fill="url(#hoodieGradient)"
              stroke="#04351f"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle cx="162" cy="232" r="23" fill="url(#furGradient)" stroke="#763c20" strokeWidth="5"/>
          </g>

          {/* rechter Arm winkt */}
          <g className="login-wave-arm">
            <path
              d="M292 205 Q315 187 330 166"
              fill="none"
              stroke="#076236"
              strokeWidth="33"
              strokeLinecap="round"
            />
            <circle cx="334" cy="156" r="25" fill="url(#furGradient)" stroke="#763c20" strokeWidth="5"/>

            <ellipse cx="323" cy="137" rx="7" ry="17" fill="#c3743d" transform="rotate(-28 323 137)"/>
            <ellipse cx="334" cy="134" rx="7" ry="18" fill="#c3743d" transform="rotate(-8 334 134)"/>
            <ellipse cx="345" cy="136" rx="7" ry="17" fill="#c3743d" transform="rotate(14 345 136)"/>
          </g>

          {/* Ohren / Knöpfe */}
          <circle cx="174" cy="103" r="38" fill="#62c628" stroke="#236e19" strokeWidth="6"/>
          <circle cx="287" cy="99" r="38" fill="#e32648" stroke="#8e1530" strokeWidth="6"/>

          <circle cx="164" cy="96" r="5" fill="#18201b"/>
          <circle cx="184" cy="96" r="5" fill="#18201b"/>
          <circle cx="164" cy="113" r="5" fill="#18201b"/>
          <circle cx="184" cy="113" r="5" fill="#18201b"/>

          <circle cx="277" cy="92" r="5" fill="#18201b"/>
          <circle cx="297" cy="92" r="5" fill="#18201b"/>
          <circle cx="277" cy="109" r="5" fill="#18201b"/>
          <circle cx="297" cy="109" r="5" fill="#18201b"/>

          {/* Kopf */}
          <circle
            cx="230"
            cy="138"
            r="91"
            fill="url(#furGradient)"
            stroke="#753b20"
            strokeWidth="7"
          />

          {/* Augen */}
          <g className="login-dustin-eyes">
            <ellipse cx="196" cy="129" rx="27" ry="32" fill="#fff"/>
            <ellipse cx="263" cy="125" rx="27" ry="32" fill="#fff"/>

            <circle cx="200" cy="135" r="15" fill="#5f321d"/>
            <circle cx="259" cy="131" r="15" fill="#5f321d"/>

            <circle cx="200" cy="135" r="10" fill="#101010"/>
            <circle cx="259" cy="131" r="10" fill="#101010"/>

            <circle cx="194" cy="128" r="4" fill="#fff"/>
            <circle cx="253" cy="124" r="4" fill="#fff"/>
          </g>

          {/* Schnauze */}
          <ellipse cx="228" cy="174" rx="46" ry="32" fill="#c77942"/>
          <ellipse cx="228" cy="158" rx="18" ry="13" fill="#211713"/>
          <path
            d="M211 180 Q228 201 247 180 Q242 211 229 214 Q215 211 211 180Z"
            fill="#2c1411"
          />
          <ellipse cx="229" cy="198" rx="13" ry="7" fill="#f16e64"/>

        </g>

        {/* Staub-Wölkchen */}
        <g className="login-dust login-dust-one">
          <circle cx="326" cy="365" r="12" fill="#c8cfcb"/>
          <circle cx="341" cy="361" r="9" fill="#d7ddda"/>
          <circle cx="352" cy="370" r="7" fill="#e4e8e6"/>
        </g>

        <g className="login-dust login-dust-two">
          <circle cx="348" cy="388" r="9" fill="#c8cfcb"/>
          <circle cx="361" cy="384" r="6" fill="#e4e8e6"/>
        </g>

      </svg>
    </div>
  )
}
