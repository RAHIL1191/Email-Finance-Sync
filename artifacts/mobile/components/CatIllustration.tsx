import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

export function CatHeaderIllustration({ size = 70 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.1} viewBox="0 0 100 110" fill="none">
      {/* Sparkles */}
      <Path d="M12 25L14 20L19 18L14 16L12 11L10 16L5 18L10 20Z" fill="#F4A261" opacity="0.8" />
      <Path d="M85 15L86.5 11L90.5 9.5L86.5 8L85 4L83.5 8L79.5 9.5L83.5 11Z" fill="#F4A261" opacity="0.8" />

      {/* Plant Leaves */}
      <Path d="M88 45C85 30 75 35 75 45C75 55 85 55 88 45Z" fill="#4CAF50" opacity="0.7" />
      <Path d="M92 50C92 38 82 40 82 50C82 60 92 60 92 50Z" fill="#81C784" opacity="0.8" />

      {/* Cat Body */}
      <Path
        d="M25 90C25 65 40 55 55 55C70 55 85 65 85 90C85 95 25 95 25 90Z"
        fill="#FFF3E8"
        stroke="#E07A5F"
        strokeWidth="2.5"
      />

      {/* Left Ear */}
      <Path d="M30 45L40 22L52 38Z" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="2.5" />
      <Path d="M34 42L41 27L48 37Z" fill="#F4A261" opacity="0.5" />

      {/* Right Ear */}
      <Path d="M78 45L68 22L56 38Z" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="2.5" />
      <Path d="M74 42L67 27L60 37Z" fill="#F4A261" opacity="0.5" />

      {/* Head */}
      <Path d="M29 46 A25 20 0 1 0 79 46 A25 20 0 1 0 29 46" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="2.5" />

      {/* Eyes */}
      <Circle cx="44" cy="44" r="2.5" fill="#2D3748" />
      <Circle cx="64" cy="44" r="2.5" fill="#2D3748" />

      {/* Cheeks */}
      <Circle cx="39" cy="49" r="3.5" fill="#FF8A65" opacity="0.5" />
      <Circle cx="69" cy="49" r="3.5" fill="#FF8A65" opacity="0.5" />

      {/* Nose & Mouth */}
      <Path d="M52 47L56 47L54 50Z" fill="#E07A5F" />
      <Path d="M51 52C52.5 54 54 54 54 52C54 54 55.5 54 57 52" stroke="#E07A5F" strokeWidth="1.8" strokeLinecap="round" />

      {/* Whiskers */}
      <Path d="M28 46L36 47M27 50L36 49" stroke="#E07A5F" strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M80 46L72 47M81 50L72 49" stroke="#E07A5F" strokeWidth="1.5" strokeLinecap="round" />

      {/* Paws */}
      <Path d="M40 88C40 82 48 82 48 88" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="2" />
      <Path d="M60 88C60 82 68 82 68 88" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="2" />
    </Svg>
  );
}

export function CatBannerIllustration({ size = 50 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.9} viewBox="0 0 80 72" fill="none">
      {/* Sparkles */}
      <Path d="M5 15L7 11L11 9.5L7 8L5 4L3 8L-1 9.5L3 11Z" fill="#F4A261" opacity="0.8" />
      <Path d="M72 10L73.5 7L76.5 5.5L73.5 4L72 1L70.5 4L67.5 5.5L70.5 7Z" fill="#F4A261" opacity="0.8" />

      {/* Cat Head Peek */}
      <Path d="M20 40L28 20L40 32Z" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="2" />
      <Path d="M60 40L52 20L40 32Z" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="2" />

      {/* Head */}
      <Path d="M16 65C16 42 64 42 64 65" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="2" />

      {/* Eyes */}
      <Circle cx="32" cy="46" r="2.5" fill="#2D3748" />
      <Circle cx="48" cy="46" r="2.5" fill="#2D3748" />

      {/* Cheeks */}
      <Circle cx="27" cy="50" r="3" fill="#FF8A65" opacity="0.5" />
      <Circle cx="53" cy="50" r="3" fill="#FF8A65" opacity="0.5" />

      {/* Nose */}
      <Path d="M39 48L41 48L40 50Z" fill="#E07A5F" />

      {/* Paws on border */}
      <Path d="M28 64C28 58 35 58 35 64" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="1.8" />
      <Path d="M45 64C45 58 52 58 52 64" fill="#FFF3E8" stroke="#E07A5F" strokeWidth="1.8" />
    </Svg>
  );
}
