import { useId } from "react";
import type { CoverArtSpec } from "../types";

interface CoverArtProps {
  art: CoverArtSpec;
  title?: string;
  index?: number;
  className?: string;
  showMeta?: boolean;
}

function Motif({ motif, art, ids }: { motif: string; art: CoverArtSpec; ids: Record<string, string> }) {
  const { glow, ink } = art;

  switch (motif) {
    case "moon":
      return (
        <>
          <circle cx="280" cy="112" r="112" fill={`url(#${ids.glow})`} opacity=".9" />
          <circle cx="280" cy="112" r="47" fill={glow} opacity=".9" />
          <circle cx="280" cy="112" r="58" fill="none" stroke={ink} strokeOpacity=".18" />
          <g fill={ink} opacity=".7">
            <circle cx="92" cy="78" r="1.4" />
            <circle cx="145" cy="46" r="1" />
            <circle cx="336" cy="46" r="1.2" />
            <circle cx="222" cy="164" r="1" />
            <circle cx="58" cy="188" r="1.1" />
          </g>
          <path d="M-20 274C52 234 100 268 161 254s112-47 174-17 89 15 117-6" fill="none" stroke={ink} strokeOpacity=".25" />
          <path d="M-10 301C63 267 111 300 178 281s113-36 172-8 84 11 110-8" fill="none" stroke={ink} strokeOpacity=".18" />
          <path d="M-20 332C62 293 126 328 194 306s115-25 175-2 82 8 104-6" fill="none" stroke={ink} strokeOpacity=".1" />
          <path d="M0 371C84 344 128 374 210 352s120-20 210 0v48H0Z" fill="#060a0d" opacity=".72" />
        </>
      );
    case "cloud":
      return (
        <>
          <ellipse cx="290" cy="92" rx="120" ry="120" fill={`url(#${ids.glow})`} opacity=".65" />
          <circle cx="292" cy="92" r="34" fill={glow} opacity=".75" />
          <g filter={`url(#${ids.blur})`} opacity=".75">
            <ellipse cx="132" cy="238" rx="98" ry="38" fill={ink} opacity=".19" />
            <ellipse cx="216" cy="218" rx="118" ry="44" fill={ink} opacity=".23" />
            <ellipse cx="320" cy="250" rx="90" ry="34" fill={ink} opacity=".15" />
          </g>
          <path d="M60 250c20-41 55-48 82-39 12-34 62-48 89-17 33-11 55 9 61 33 31 0 51 16 54 36" fill="none" stroke={ink} strokeOpacity=".32" />
          <path d="M-20 310C60 282 122 304 188 286s116-20 172 4 93 12 140-12" fill="none" stroke={ink} strokeOpacity=".13" />
          <path d="M0 360C78 331 137 355 212 337s130-17 208 6v57H0Z" fill="#090b0d" opacity=".6" />
          <g fill={ink} opacity=".65">
            <circle cx="72" cy="98" r="1" />
            <circle cx="126" cy="54" r="1.4" />
            <circle cx="192" cy="120" r=".9" />
            <circle cx="340" cy="66" r="1.1" />
          </g>
        </>
      );
    case "window":
      return (
        <>
          <rect x="52" y="48" width="296" height="304" rx="4" fill="none" stroke={ink} strokeOpacity=".38" />
          <rect x="58" y="54" width="284" height="292" fill={`url(#${ids.glow})`} opacity=".28" />
          <path d="M58 54h284v292H58z" fill="none" stroke={ink} strokeOpacity=".16" />
          <path d="M200 54v292M58 198h284" stroke={ink} strokeOpacity=".32" />
          <path d="M0 0l160 0L62 400H-18Z" fill={ink} opacity=".035" />
          <path d="M200 350c-2-39 6-71 29-94-18 3-27 1-38-8 13 4 24 3 38 4-4-19-2-35 8-51 2 17 5 30 13 41 11-18 21-25 38-31-9 13-14 24-14 39 10-3 19-2 28 4-13 1-21 4-29 12-20 18-24 37-21 65Z" fill="#0a0d0c" opacity=".82" />
          <path d="M360 120c-18 0-30 20-30 46s12 45 30 45" fill="none" stroke={ink} strokeOpacity=".18" />
          <g fill={ink} opacity=".46">
            <circle cx="111" cy="111" r="1.2" />
            <circle cx="332" cy="93" r="1" />
            <circle cx="282" cy="242" r="1.1" />
          </g>
        </>
      );
    case "rain":
      return (
        <>
          <circle cx="282" cy="122" r="118" fill={`url(#${ids.glow})`} opacity=".55" />
          <circle cx="282" cy="122" r="56" fill="none" stroke={ink} strokeOpacity=".23" />
          <rect x="42" y="34" width="316" height="332" rx="2" fill="none" stroke={ink} strokeOpacity=".25" />
          {Array.from({ length: 40 }).map((_, i) => {
            const x = (i * 53 + 17) % 382 + 9;
            const y = (i * 97 + 31) % 340 + 7;
            return (
              <line
                key={i}
                x1={x}
                y1={y}
                x2={x - 9}
                y2={y + 19 + (i % 5) * 5}
                stroke={ink}
                strokeOpacity={0.07 + (i % 4) * 0.035}
                strokeWidth={0.8}
              />
            );
          })}
          <g fill={ink} opacity=".5">
            <circle cx="88" cy="104" r="1.1" />
            <circle cx="124" cy="285" r=".9" />
            <circle cx="330" cy="247" r="1.2" />
          </g>
          <path d="M0 352c72-12 121 15 184 3s120-22 216-4v49H0Z" fill="#07100f" opacity=".58" />
        </>
      );
    case "wave":
      return (
        <>
          <circle cx="286" cy="102" r="126" fill={`url(#${ids.glow})`} opacity=".38" />
          <circle cx="286" cy="102" r="38" fill="none" stroke={ink} strokeOpacity=".3" />
          <g fill="none" stroke={glow} strokeOpacity=".38">
            <path d="M-20 184c54-37 94-37 142 0s92 35 148-1 98-32 152 4" />
            <path d="M-20 210c54-37 94-37 142 0s92 35 148-1 98-32 152 4" opacity=".7" />
            <path d="M-20 238c54-37 94-37 142 0s92 35 148-1 98-32 152 4" opacity=".5" />
          </g>
          <g fill="none" stroke={ink} strokeOpacity=".14">
            <path d="M-20 280c62-25 110-22 162 7s102 23 158-5 94-25 130 1" />
            <path d="M-20 315c62-25 110-22 162 7s102 23 158-5 94-25 130 1" />
            <path d="M-20 350c62-25 110-22 162 7s102 23 158-5 94-25 130 1" />
          </g>
          <path d="M0 382c85-15 144 7 206-5s121-15 194 3v30H0Z" fill="#050b10" opacity=".65" />
          <g fill={ink} opacity=".55">
            <circle cx="84" cy="61" r="1.2" />
            <circle cx="132" cy="114" r=".9" />
            <circle cx="320" cy="46" r="1" />
          </g>
        </>
      );
    case "ember":
      return (
        <>
          <circle cx="186" cy="300" r="145" fill={`url(#${ids.glow})`} opacity=".62" />
          <path d="M0 238l86-73 56 38 69-91 82 84 50-38 57 62v180H0Z" fill="#07090b" opacity=".72" />
          <path d="M0 296l73-41 58 25 67-48 68 47 71-28 63 41v108H0Z" fill="#050707" opacity=".8" />
          <g fill={glow}>
            {[
              [158, 236, 2.3],
              [188, 264, 1.6],
              [143, 283, 1.2],
              [222, 247, 1.8],
              [204, 310, 1.1],
              [249, 287, 1.5],
              [119, 255, 1.1],
            ].map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} opacity={0.55 - i * 0.04} />
            ))}
          </g>
          <g fill={ink} opacity=".62">
            <circle cx="78" cy="65" r="1" />
            <circle cx="112" cy="92" r="1.4" />
            <circle cx="302" cy="52" r="1" />
            <circle cx="346" cy="98" r="1.2" />
            <circle cx="264" cy="122" r=".8" />
            <circle cx="184" cy="42" r="1" />
          </g>
          <path d="M0 350c83-15 152 13 227-2s110-13 173 3v49H0Z" fill="#030404" opacity=".65" />
        </>
      );
    case "garden":
      return (
        <>
          <circle cx="300" cy="88" r="105" fill={`url(#${ids.glow})`} opacity=".42" />
          <circle cx="300" cy="88" r="30" fill="none" stroke={ink} strokeOpacity=".27" />
          <g stroke={ink} strokeOpacity=".3" fill="none">
            <path d="M99 351c8-79 3-135-17-186" />
            <path d="M99 264c-20-13-36-40-34-62 22 11 38 31 39 57" fill={ink} fillOpacity=".09" />
            <path d="M99 296c22-8 39-26 43-49-25 6-41 24-44 46" fill={ink} fillOpacity=".09" />
            <path d="M174 351c-5-61-6-118 6-167" />
            <path d="M177 257c18-11 32-35 30-57-21 10-34 31-33 53" fill={ink} fillOpacity=".07" />
            <path d="M263 351c-8-83 6-149 33-198" />
            <path d="M283 250c20-12 34-38 31-61-22 12-36 34-34 58" fill={ink} fillOpacity=".08" />
          </g>
          <g stroke={ink} strokeOpacity=".08">
            {Array.from({ length: 20 }).map((_, i) => {
              const x = (i * 71 + 9) % 400;
              const y = (i * 47 + 12) % 250;
              return <line key={i} x1={x} y1={y} x2={x - 7} y2={y + 18} />;
            })}
          </g>
          <path d="M0 344c80-18 141 4 216-7s111-9 184 6v57H0Z" fill="#080b08" opacity=".6" />
          <ellipse cx="196" cy="350" rx="53" ry="8" fill="none" stroke={ink} strokeOpacity=".17" />
          <ellipse cx="196" cy="363" rx="31" ry="4" fill="none" stroke={ink} strokeOpacity=".12" />
        </>
      );
    case "cafe":
      return (
        <>
          <circle cx="294" cy="83" r="94" fill={`url(#${ids.glow})`} opacity=".66" />
          <path d="M267 46v153" stroke={ink} strokeOpacity=".34" />
          <path d="M247 198h58l26 46h-110Z" fill={ink} opacity=".16" stroke={ink} strokeOpacity=".22" />
          <path d="M230 66c42 5 76 39 80 80" fill="none" stroke={ink} strokeOpacity=".15" />
          <path d="M0 264h400M0 318h400M0 374h400M88 236v148M178 236v148M268 236v148M358 236v148" stroke={ink} strokeOpacity=".1" />
          <path d="M-40 236L206 174l170 62H-40Z" fill="#060707" opacity=".52" />
          <g fill="none" stroke={ink} strokeOpacity=".2">
            <path d="M282 86c-13-13-3-29 8-35-5 11-5 21 2 27" />
            <path d="M302 93c-13-13-3-29 8-35-5 11-5 21 2 27" />
          </g>
          <g fill={ink} opacity=".55">
            <circle cx="72" cy="80" r="1" />
            <circle cx="122" cy="53" r="1.3" />
            <circle cx="342" cy="164" r=".9" />
          </g>
        </>
      );
    case "mountain":
      return (
        <>
          <circle cx="281" cy="95" r="96" fill={`url(#${ids.glow})`} opacity=".7" />
          <circle cx="281" cy="95" r="34" fill={ink} opacity=".72" />
          <path d="M-20 288L74 190l53 57 65-106 92 118 41-48 95 106v119H-20Z" fill="#0b1114" opacity=".72" />
          <path d="M-20 330L72 234l60 66 65-70 85 85 55-37 83 66v84H-20Z" fill="#070b0d" opacity=".82" />
          <path d="M107 230l17 20 19-24 12 25M231 222l25 28 20-24" fill="none" stroke={ink} strokeOpacity=".22" />
          <g fill={ink} opacity=".6">
            {Array.from({ length: 18 }).map((_, i) => (
              <circle key={i} cx={(i * 67 + 27) % 390 + 4} cy={(i * 39 + 19) % 230 + 10} r={i % 4 === 0 ? 1.3 : 0.8} />
            ))}
          </g>
          <path d="M0 356c73-12 142 9 211-2s121-12 189 5v64H0Z" fill="#040708" opacity=".55" />
        </>
      );
    case "cat":
      return (
        <>
          <circle cx="286" cy="97" r="115" fill={`url(#${ids.glow})`} opacity=".38" />
          <rect x="47" y="37" width="306" height="275" rx="4" fill="none" stroke={ink} strokeOpacity=".18" />
          <g stroke={ink} strokeOpacity=".08">
            {Array.from({ length: 24 }).map((_, i) => {
              const x = (i * 61 + 11) % 380 + 10;
              const y = (i * 43 + 8) % 250;
              return <line key={i} x1={x} y1={y} x2={x - 6} y2={y + 18} />;
            })}
          </g>
          <ellipse cx="198" cy="322" rx="105" ry="28" fill={ink} opacity=".09" />
          <path
            d="M141 302c-12-30-6-65 9-91 13-22 31-32 50-33 21-1 42 10 53 31 17 31 21 66 7 95-25 7-91 7-119-2Z"
            fill="#080b0c"
            opacity=".88"
          />
          <path d="M153 190l-9-37 34 18M249 188l15-35 17 33" fill="#080b0c" stroke="#080b0c" strokeLinejoin="round" />
          <g fill={glow} opacity=".7">
            <ellipse cx="181" cy="245" rx="2.3" ry="3.6" />
            <ellipse cx="224" cy="245" rx="2.3" ry="3.6" />
          </g>
          <path d="M204 258c0 6-6 8-11 4M261 286c33-13 45-37 33-55-10-15-28-13-35-5" fill="none" stroke="#080b0c" strokeWidth="9" strokeLinecap="round" />
          <g fill={ink} opacity=".62">
            <circle cx="76" cy="83" r="1" />
            <circle cx="331" cy="58" r="1.2" />
            <circle cx="319" cy="246" r=".9" />
          </g>
        </>
      );
    case "book":
      return (
        <>
          <circle cx="292" cy="74" r="93" fill={`url(#${ids.glow})`} opacity=".52" />
          <path d="M95 286c38-22 73-26 105-11 32-15 67-11 105 11-28-58-59-86-105-91-46 5-77 33-105 91Z" fill="#080a0b" opacity=".72" />
          <path d="M199 195v86" stroke={ink} strokeOpacity=".3" />
          <path d="M113 270c29-15 55-19 78-8M113 285c29-13 55-16 78-6M209 262c27-11 52-8 78 8M209 277c27-9 52-5 78 7" fill="none" stroke={ink} strokeOpacity=".18" />
          <path d="M199 196c-22-26-54-32-82-20M199 196c22-26 54-32 82-20" fill="none" stroke={ink} strokeOpacity=".22" />
          <g stroke={ink} strokeOpacity=".12">
            <path d="M76 112h73M76 126h49M265 152h57" />
            <path d="M70 84h88M248 106h75" />
          </g>
          <path d="M0 330c75-13 134 12 205-3s117-14 195 0v73H0Z" fill="#070808" opacity=".55" />
          <g fill={ink} opacity=".55">
            <circle cx="91" cy="46" r="1" />
            <circle cx="316" cy="227" r="1.2" />
            <circle cx="351" cy="54" r=".8" />
          </g>
        </>
      );
    case "horizon":
      return (
        <>
          <rect width="400" height="400" fill={`url(#${ids.sky})`} />
          <circle cx="200" cy="250" r="102" fill={`url(#${ids.glow})`} opacity=".66" />
          <circle cx="200" cy="250" r="42" fill={glow} opacity=".65" />
          <path d="M0 249h400" stroke={ink} strokeOpacity=".42" />
          <path d="M0 259c56 3 91 8 143 6s88-9 128-7 75 7 129 4" fill="none" stroke={ink} strokeOpacity=".18" />
          <g stroke={ink} strokeOpacity=".18">
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={i} x1={200 + (i % 2 ? 1 : -1) * (28 + i * 13)} y1={278 + i * 10} x2={200 + (i % 2 ? -1 : 1) * (10 + i * 8)} y2={278 + i * 10} />
            ))}
          </g>
          <path d="M0 324c75 11 132-10 202-2s121 11 198-1v79H0Z" fill="#060a0c" opacity=".6" />
          <g fill="none" stroke={ink} strokeOpacity=".35">
            <path d="M84 116c7-7 12-7 19-1M285 93c5-5 10-5 15-1" />
          </g>
          <g fill={ink} opacity=".5">
            <circle cx="132" cy="62" r="1" />
            <circle cx="321" cy="45" r="1.1" />
          </g>
        </>
      );
    default:
      return <circle cx="200" cy="200" r="120" fill={`url(#${ids.glow})`} />;
  }
}

export function CoverArt({ art, title, index, className = "", showMeta = true }: CoverArtProps) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const ids = {
    bg: `bg-${uid}`,
    glow: `glow-${uid}`,
    sky: `sky-${uid}`,
    blur: `blur-${uid}`,
  };

  return (
    <div
      className={`cover-art ${className}`}
      style={{ background: art.base }}
      role="img"
      aria-label={title ? `${title} 作品封面` : "作品封面"}
    >
      <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={art.base} />
            <stop offset="100%" stopColor="#080b0e" />
          </linearGradient>
          <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111b28" />
            <stop offset="65%" stopColor="#433238" />
            <stop offset="100%" stopColor={art.base} />
          </linearGradient>
          <radialGradient id={ids.glow}>
            <stop offset="0%" stopColor={art.glow} stopOpacity=".95" />
            <stop offset="55%" stopColor={art.glow} stopOpacity=".3" />
            <stop offset="100%" stopColor={art.glow} stopOpacity="0" />
          </radialGradient>
          <filter id={ids.blur} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
        </defs>
        <rect width="400" height="400" fill={`url(#${ids.bg})`} />
        {art.motif !== "horizon" && (
          <circle cx="330" cy="360" r="130" fill={`url(#${ids.glow})`} opacity=".2" />
        )}
        <Motif motif={art.motif} art={art} ids={ids} />
        <rect width="400" height="400" fill="none" stroke={art.ink} strokeOpacity=".08" />
      </svg>
      <span className="cover-grain" aria-hidden="true" />
      <span className="cover-glyph" aria-hidden="true">
        {art.glyph}
      </span>
      {showMeta && (
        <span className="cover-meta" aria-hidden="true">
          <span>YORU</span>
          <span>{typeof index === "number" ? String(index + 1).padStart(2, "0") : "ASMR.ONE"}</span>
        </span>
      )}
    </div>
  );
}
