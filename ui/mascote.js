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
