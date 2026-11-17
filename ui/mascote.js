// O desenho do franguinho, compartilhado pela janela principal e pela mini.
// O humor (dormindo/trabalhando/comemorando) e o acessório vêm de classes e
// atributos no elemento .mascote, animados pelo style.css.

export const svgMascote = `
<svg viewBox="0 0 200 165" aria-hidden="true">
  <ellipse class="sombra" cx="90" cy="152" rx="40" ry="7"/>
  <g class="pernas">
    <path d="M80 122 V148 M80 148 h10 M100 122 V148 M100 148 h10"/>
  </g>
  <g class="corpo">
    <g class="crista">
      <circle cx="79" cy="46" r="9"/>
      <circle cx="90" cy="39" r="11"/>
      <circle cx="101" cy="46" r="9"/>
    </g>
    <circle class="pele" cx="90" cy="92" r="46"/>
    <ellipse class="barriga" cx="84" cy="106" rx="27" ry="19"/>
    <ellipse class="asa" cx="68" cy="99" rx="18" ry="13"/>
    <circle class="bochecha" cx="117" cy="98" r="7"/>
    <g class="olho olho-aberto">
      <circle cx="108" cy="80" r="6.5"/>
      <circle class="brilho" cx="110.5" cy="77.5" r="2"/>
    </g>
    <path class="olho olho-fechado" d="M101 81 q7 5 14 0"/>
    <path class="olho olho-feliz" d="M101 83 l7 -7 l7 7"/>
    <path class="bico" d="M132 84 L153 93 L132 102 Z"/>
    <!-- Acessórios liberados por conquistas -->
    <g class="acessorio chapeu">
      <path class="peca" d="M68 50 L104 46 L83 6 Z" fill="#4f8fdc"/>
      <path d="M75 35 L96 33 M79 21 L89 20" stroke="#ffd64f" stroke-width="4" stroke-linecap="round"/>
      <circle class="peca" cx="83" cy="6" r="6" fill="#e6463c"/>
    </g>
    <g class="acessorio oculos">
      <path d="M98 76 L66 72" stroke="#3a2a20" stroke-width="3" stroke-linecap="round"/>
      <rect x="97" y="72" width="24" height="15" rx="6" fill="#3a2a20"/>
      <path d="M101 76 h6" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
    </g>
    <g class="acessorio laco">
      <path class="peca" d="M114 52 L100 42 L102 60 Z M114 52 L128 42 L126 60 Z" fill="#ff7eb6"/>
      <circle class="peca" cx="114" cy="52" r="5" fill="#ff7eb6"/>
    </g>
    <!-- Acessórios de temporada -->
  <g class="acessorio gorro">
    <path class="peca" d="M66 48 C70 18 96 4 120 20 L112 47 Z" fill="#e6463c"/>
    <ellipse class="peca" cx="90" cy="49" rx="28" ry="7" fill="#fff"/>
    <circle class="peca" cx="121" cy="21" r="7" fill="#fff"/>
  </g>
  <g class="acessorio palha">
    <path class="peca" d="M70 46 Q71 20 90 20 Q109 20 110 46 Z" fill="#e8c27a"/>
    <path d="M71 39 Q90 35 109 39 L110 44 Q90 40 70 44 Z" fill="#e6463c"/>
    <ellipse class="peca" cx="90" cy="47" rx="44" ry="8" fill="#e8c27a"/>
    <path d="M58 47 h8 M78 50 h8 M98 50 h8 M116 47 h8" stroke="#c99a4a" stroke-width="2" stroke-linecap="round"/>
  </g>
  <g class="acessorio bruxa">
    <path class="peca" d="M69 45 L98 0 L111 45 Z" fill="#4a3a6a"/>
    <path d="M72 40 L109 40 L110 45 L70 45 Z" fill="#ff8c32"/>
    <ellipse class="peca" cx="90" cy="47" rx="40" ry="7" fill="#4a3a6a"/>
  </g>
  <g class="acessorio orelhas">
    <ellipse class="peca" cx="76" cy="24" rx="8" ry="23" fill="#fff" transform="rotate(-14 76 24)"/>
    <ellipse cx="76" cy="25" rx="3.5" ry="15" fill="#ffb3c6" transform="rotate(-14 76 25)"/>
    <ellipse class="peca" cx="100" cy="22" rx="8" ry="23" fill="#fff" transform="rotate(12 100 22)"/>
    <ellipse cx="100" cy="23" rx="3.5" ry="15" fill="#ffb3c6" transform="rotate(12 100 23)"/>
  </g>
  <g class="acessorio mascara">
    <path d="M97 76 L66 72" stroke="#5a3c28" stroke-width="2.5" stroke-linecap="round"/>
    <path class="peca" fill-rule="evenodd" fill="#c060b0"
          d="M95 73 Q108 64 123 72 Q125 84 116 88 Q108 84 100 88 Q93 82 95 73 Z M114.5 80 a6.5 6.5 0 1 0 -13 0 a6.5 6.5 0 1 0 13 0 Z"/>
    <path class="peca" d="M120 71 Q126 56 136 50 Q130 62 124 73 Z" fill="#ffd64f"/>
    <circle cx="98" cy="74" r="1.8" fill="#ffd64f"/>
    <circle cx="121" cy="84" r="1.8" fill="#4f8fdc"/>
  </g>
  <g class="acessorio coroa">
      <path class="peca" d="M70 46 L70 24 L80 34 L90 18 L100 34 L110 24 L110 46 Z" fill="#ffc21a"/>
      <circle cx="90" cy="38" r="4" fill="#e6463c"/>
      <circle cx="78" cy="40" r="3" fill="#4f8fdc"/>
      <circle cx="102" cy="40" r="3" fill="#5fae4c"/>
    </g>
  </g>
  <g class="milho">
    <circle cx="140" cy="149" r="3.5"/>
    <circle cx="151" cy="151" r="3.5"/>
    <circle cx="160" cy="148" r="3.5"/>
  </g>
  <g class="zzz">
    <text x="140" y="56">z</text>
    <text x="140" y="56">z</text>
    <text x="140" y="56">z</text>
  </g>
  <ellipse class="ovo" cx="168" cy="134" rx="13" ry="17"/>
</svg>`;
