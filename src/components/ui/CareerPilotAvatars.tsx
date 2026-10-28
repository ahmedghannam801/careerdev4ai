import React from 'react';
import { Check } from 'lucide-react';

export interface AvatarOption {
  id: string;
  name: string;
  description: string;
}

export const CAREERPILOT_AVATARS: AvatarOption[] = [
  { id: 'avatar-01', name: 'Alex', description: 'Modern minimal crew style' },
  { id: 'avatar-02', name: 'Maya', description: 'Classic professional waves' },
  { id: 'avatar-03', name: 'Liam', description: 'Curated architectural glasses' },
  { id: 'avatar-04', name: 'Sophia', description: 'Sleek contemporary bob' },
  { id: 'avatar-05', name: 'Tariq', description: 'Sharp collared professional' },
  { id: 'avatar-06', name: 'Elena', description: 'Dynamic textured curls' },
  { id: 'avatar-07', name: 'Marcus', description: 'Clean executive profile' },
  { id: 'avatar-08', name: 'Chloe', description: 'Modern creative pixie' },
  { id: 'avatar-09', name: 'Jin', description: 'Refined layered tailored' },
  { id: 'avatar-10', name: 'Zara', description: 'Elegant tailored drape' },
  { id: 'avatar-11', name: 'David', description: 'Relaxed technical lead' },
  { id: 'avatar-12', name: 'Amara', description: 'Sophisticated braided updo' },
];

export const DEFAULT_AVATAR_ID = 'avatar-01';

export function normalizeAvatarId(input?: string | null): string {
  if (!input) return DEFAULT_AVATAR_ID;
  const match = CAREERPILOT_AVATARS.find(a => a.id === input);
  if (match) return match.id;
  // If input contains avatar-XX
  const idMatch = input.match(/avatar-\d{2}/);
  if (idMatch && CAREERPILOT_AVATARS.some(a => a.id === idMatch[0])) {
    return idMatch[0];
  }
  return DEFAULT_AVATAR_ID;
}

interface AvatarSvgProps {
  id: string;
  className?: string;
  size?: number | string;
}

export const CareerPilotAvatarSvg: React.FC<AvatarSvgProps> = ({ id, className = '', size }) => {
  const normalizedId = normalizeAvatarId(id);
  const sizeStyle = size ? { width: size, height: size } : undefined;

  switch (normalizedId) {
    case 'avatar-01':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Alex Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#EBDDCF" />
          {/* Shoulders */}
          <path d="M22 88C22 73 34 68 50 68C66 68 78 73 78 88" fill="#B94736" />
          <path d="M42 68L50 75L58 68" stroke="#D9A49A" strokeWidth="2" strokeLinecap="round" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#E8B99D" />
          {/* Head */}
          <ellipse cx="50" cy="42" rx="16" ry="18" fill="#F5D0C5" />
          {/* Hair */}
          <path d="M34 40C34 28 42 22 50 22C58 22 66 28 66 38C66 41 64 36 62 33C58 29 42 29 38 34C36 36 34 42 34 40Z" fill="#282B29" />
          {/* Eyes & Brows */}
          <circle cx="44" cy="42" r="1.75" fill="#282B29" />
          <circle cx="56" cy="42" r="1.75" fill="#282B29" />
          <path d="M41 38C43 37 46 37 47 38" stroke="#282B29" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M53 38C54 37 57 37 59 38" stroke="#282B29" strokeWidth="1.2" strokeLinecap="round" />
          {/* Smile */}
          <path d="M47 48C48.5 50 51.5 50 53 48" stroke="#B94736" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-02':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Maya Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#DDE6D5" />
          {/* Back Hair */}
          <path d="M30 42C28 55 30 70 34 76C38 68 40 56 40 45" fill="#282B29" />
          <path d="M70 42C72 55 70 70 66 76C62 68 60 56 60 45" fill="#282B29" />
          {/* Body */}
          <path d="M22 88C22 74 33 68 50 68C67 68 78 74 78 88" fill="#686D76" />
          <path d="M38 88L46 72H54L62 88" fill="#FFFFFF" />
          <path d="M46 72L50 78L54 72" fill="#B94736" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#D09875" />
          {/* Head */}
          <ellipse cx="50" cy="42" rx="15" ry="17" fill="#E8B99D" />
          {/* Front Hair */}
          <path d="M34 42C34 26 44 22 50 22C60 22 66 28 66 42C64 33 58 27 50 27C42 27 36 34 34 42Z" fill="#282B29" />
          {/* Eyes */}
          <circle cx="44" cy="42" r="1.75" fill="#282B29" />
          <circle cx="56" cy="42" r="1.75" fill="#282B29" />
          <path d="M41 38C43 37 46 37 47 38" stroke="#282B29" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M53 38C54 37 57 37 59 38" stroke="#282B29" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M47 48C48.5 50 51.5 50 53 48" stroke="#B94736" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-03':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Liam Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#E1DDD5" />
          {/* Body */}
          <path d="M22 88C22 73 34 68 50 68C66 68 78 73 78 88" fill="#282B29" />
          {/* Neck */}
          <rect x="44" y="53" width="12" height="15" rx="6" fill="#F5D0C5" />
          {/* Head */}
          <ellipse cx="50" cy="42" rx="16" ry="18" fill="#F5D0C5" />
          {/* Textured hair */}
          <path d="M33 38C33 25 43 23 50 23C58 23 67 26 67 36C65 30 59 27 50 27C41 27 35 32 33 38Z" fill="#4A403A" />
          {/* Glasses */}
          <rect x="38" y="38" width="10" height="8" rx="2" stroke="#B94736" strokeWidth="1.5" fill="none" />
          <rect x="52" y="38" width="10" height="8" rx="2" stroke="#B94736" strokeWidth="1.5" fill="none" />
          <line x1="48" y1="42" x2="52" y2="42" stroke="#B94736" strokeWidth="1.5" />
          <circle cx="43" cy="42" r="1.5" fill="#282B29" />
          <circle cx="57" cy="42" r="1.5" fill="#282B29" />
          {/* Smile */}
          <path d="M47 50C48.5 51.5 51.5 51.5 53 50" stroke="#B94736" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-04':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Sophia Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#D9A49A" fillOpacity="0.4" />
          {/* Bob hair back */}
          <path d="M31 38C31 52 35 60 38 64C33 55 33 42 33 38" fill="#282B29" />
          <path d="M69 38C69 52 65 60 62 64C67 55 67 42 67 38" fill="#282B29" />
          {/* Body */}
          <path d="M22 88C22 74 34 68 50 68C66 68 78 74 78 88" fill="#B94736" />
          <path d="M44 68L50 76L56 68" fill="#F5F0E8" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#E8B99D" />
          {/* Head */}
          <ellipse cx="50" cy="43" rx="15" ry="17" fill="#F7DFD4" />
          {/* Front Bob */}
          <path d="M32 40C32 25 42 22 50 22C58 22 68 25 68 40C68 50 63 56 61 58C62 48 62 30 50 30C38 30 38 48 39 58C37 56 32 50 32 40Z" fill="#282B29" />
          {/* Eyes */}
          <circle cx="44" cy="43" r="1.75" fill="#282B29" />
          <circle cx="56" cy="43" r="1.75" fill="#282B29" />
          <path d="M47 50C48.5 51.5 51.5 51.5 53 50" stroke="#B94736" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-05':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Tariq Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#E1DDD5" />
          {/* Body */}
          <path d="M22 88C22 73 34 68 50 68C66 68 78 73 78 88" fill="#3D433F" />
          <path d="M45 68V88H55V68" fill="#F5F0E8" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#A66E4A" />
          {/* Head */}
          <ellipse cx="50" cy="42" rx="16" ry="18" fill="#A66E4A" />
          {/* Fade Hair */}
          <path d="M34 38C34 26 42 22 50 22C58 22 66 26 66 38C64 30 58 26 50 26C42 26 36 30 34 38Z" fill="#1C201E" />
          {/* Beard */}
          <path d="M38 46C38 56 44 60 50 60C56 60 62 56 62 46C62 52 58 58 50 58C42 58 38 52 38 46Z" fill="#1C201E" />
          {/* Eyes */}
          <circle cx="44" cy="42" r="1.75" fill="#1C201E" />
          <circle cx="56" cy="42" r="1.75" fill="#1C201E" />
          <path d="M41 38C43 37 46 37 47 38" stroke="#1C201E" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M53 38C54 37 57 37 59 38" stroke="#1C201E" strokeWidth="1.4" strokeLinecap="round" />
          {/* Smile */}
          <path d="M47 50C48.5 51.5 51.5 51.5 53 50" stroke="#F5F0E8" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-06':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Elena Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#DDE6D5" />
          {/* Ponytail puff */}
          <circle cx="64" cy="28" r="9" fill="#4A403A" />
          {/* Body */}
          <path d="M22 88C22 74 34 68 50 68C66 68 78 74 78 88" fill="#D9A49A" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#D09875" />
          {/* Head */}
          <ellipse cx="50" cy="43" rx="15" ry="17" fill="#E8B99D" />
          {/* Front Curly Hair */}
          <path d="M34 40C34 26 43 23 50 23C57 23 65 26 65 38C62 30 56 26 50 26C43 26 36 31 34 40Z" fill="#4A403A" />
          <circle cx="37" cy="32" r="3" fill="#4A403A" />
          <circle cx="43" cy="27" r="3" fill="#4A403A" />
          {/* Eyes */}
          <circle cx="44" cy="43" r="1.75" fill="#282B29" />
          <circle cx="56" cy="43" r="1.75" fill="#282B29" />
          <path d="M47 50C48.5 51.5 51.5 51.5 53 50" stroke="#B94736" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-07':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Marcus Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#EBDDCF" />
          {/* Body */}
          <path d="M22 88C22 73 34 68 50 68C66 68 78 73 78 88" fill="#B94736" />
          <path d="M43 68L50 78L57 68" stroke="#F5F0E8" strokeWidth="2" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#754B33" />
          {/* Head */}
          <ellipse cx="50" cy="42" rx="16" ry="18" fill="#754B33" />
          {/* Buzz cut */}
          <path d="M34 38C34 25 43 21 50 21C57 21 66 25 66 38C65 29 59 24 50 24C41 24 35 29 34 38Z" fill="#282B29" />
          {/* Eyes */}
          <circle cx="44" cy="42" r="1.75" fill="#1C201E" />
          <circle cx="56" cy="42" r="1.75" fill="#1C201E" />
          <path d="M41 38C43 37 46 37 47 38" stroke="#1C201E" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M53 38C54 37 57 37 59 38" stroke="#1C201E" strokeWidth="1.4" strokeLinecap="round" />
          {/* Smile */}
          <path d="M47 50C48.5 51.5 51.5 51.5 53 50" stroke="#F5F0E8" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-08':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Chloe Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#DDE6D5" />
          {/* Body */}
          <path d="M22 88C22 74 34 68 50 68C66 68 78 74 78 88" fill="#686D76" />
          <rect x="42" y="60" width="16" height="12" rx="4" fill="#3D433F" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="12" rx="4" fill="#F5D0C5" />
          {/* Head */}
          <ellipse cx="50" cy="42" rx="15" ry="17" fill="#F5D0C5" />
          {/* Pixie cut */}
          <path d="M34 40C33 27 42 22 50 22C58 22 66 26 66 38C63 33 55 27 46 29C39 31 35 36 34 40Z" fill="#8C533E" />
          {/* Glasses */}
          <circle cx="44" cy="42" r="5" stroke="#282B29" strokeWidth="1.4" fill="none" />
          <circle cx="56" cy="42" r="5" stroke="#282B29" strokeWidth="1.4" fill="none" />
          <line x1="49" y1="42" x2="51" y2="42" stroke="#282B29" strokeWidth="1.4" />
          <circle cx="44" cy="42" r="1.5" fill="#282B29" />
          <circle cx="56" cy="42" r="1.5" fill="#282B29" />
          {/* Smile */}
          <path d="M47 50C48.5 51.5 51.5 51.5 53 50" stroke="#B94736" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-09':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Jin Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#E1DDD5" />
          {/* Body */}
          <path d="M22 88C22 73 34 68 50 68C66 68 78 73 78 88" fill="#3D433F" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#F7DFD4" />
          {/* Head */}
          <ellipse cx="50" cy="42" rx="16" ry="18" fill="#F7DFD4" />
          {/* Layered hair */}
          <path d="M33 39C33 26 43 22 50 22C58 22 67 25 67 38C65 32 58 28 50 28C42 28 35 34 33 39Z" fill="#1C201E" />
          <path d="M38 30C43 32 49 35 52 38C48 38 42 36 38 30Z" fill="#1C201E" />
          {/* Eyes */}
          <circle cx="44" cy="42" r="1.75" fill="#1C201E" />
          <circle cx="56" cy="42" r="1.75" fill="#1C201E" />
          {/* Smile */}
          <path d="M47 50C48.5 51.5 51.5 51.5 53 50" stroke="#B94736" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-10':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Zara Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#DDE6D5" />
          {/* Body */}
          <path d="M22 88C22 74 34 68 50 68C66 68 78 74 78 88" fill="#686D76" />
          {/* Hijab Drape */}
          <path d="M30 45C30 26 40 21 50 21C60 21 70 26 70 45C70 65 64 74 50 75C36 74 30 65 30 45Z" fill="#B94736" />
          {/* Face opening */}
          <ellipse cx="50" cy="44" rx="13" ry="16" fill="#D09875" />
          {/* Undercap */}
          <path d="M39 34C43 31 57 31 61 34C58 32 42 32 39 34Z" fill="#D9A49A" />
          {/* Eyes */}
          <circle cx="45" cy="43" r="1.75" fill="#282B29" />
          <circle cx="55" cy="43" r="1.75" fill="#282B29" />
          <path d="M42 39C44 38 47 38 48 39" stroke="#282B29" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M52 39C53 38 56 38 58 39" stroke="#282B29" strokeWidth="1.2" strokeLinecap="round" />
          {/* Smile */}
          <path d="M47 51C48.5 52.5 51.5 52.5 53 51" stroke="#F5F0E8" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-11':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="David Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#EBDDCF" />
          {/* Body */}
          <path d="M22 88C22 73 34 68 50 68C66 68 78 73 78 88" fill="#686D76" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#E8B99D" />
          {/* Head */}
          <ellipse cx="50" cy="42" rx="16" ry="18" fill="#E8B99D" />
          {/* Wavy hair */}
          <path d="M33 38C33 24 43 22 50 22C57 22 67 24 67 38C65 31 59 27 50 27C41 27 35 31 33 38Z" fill="#4A403A" />
          {/* Stubble/Beard */}
          <path d="M42 52C45 54 55 54 58 52C57 56 54 58 50 58C46 58 43 56 42 52Z" fill="#4A403A" fillOpacity="0.4" />
          {/* Eyes */}
          <circle cx="44" cy="42" r="1.75" fill="#282B29" />
          <circle cx="56" cy="42" r="1.75" fill="#282B29" />
          {/* Smile */}
          <path d="M47 50C48.5 51.5 51.5 51.5 53 50" stroke="#B94736" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case 'avatar-12':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Amara Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#DDE6D5" />
          {/* High braided bun */}
          <circle cx="50" cy="22" r="10" fill="#282B29" />
          <circle cx="50" cy="22" r="7" stroke="#D9A49A" strokeWidth="1" strokeDasharray="2 2" fill="none" />
          {/* Body */}
          <path d="M22 88C22 74 34 68 50 68C66 68 78 74 78 88" fill="#B94736" />
          {/* Neck */}
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#754B33" />
          {/* Head */}
          <ellipse cx="50" cy="43" rx="15" ry="17" fill="#754B33" />
          {/* Hairline */}
          <path d="M35 38C35 28 43 25 50 25C57 25 65 28 65 38C63 32 58 29 50 29C42 29 37 32 35 38Z" fill="#282B29" />
          {/* Eyes */}
          <circle cx="44" cy="43" r="1.75" fill="#1C201E" />
          <circle cx="56" cy="43" r="1.75" fill="#1C201E" />
          {/* Smile */}
          <path d="M47 51C48.5 52.5 51.5 52.5 53 51" stroke="#F5F0E8" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={sizeStyle} role="img" aria-label="Default Avatar">
          <rect width="100" height="100" rx="20" fill="#F5F0E8" />
          <circle cx="50" cy="50" r="42" fill="#EBDDCF" />
          <path d="M22 88C22 73 34 68 50 68C66 68 78 73 78 88" fill="#B94736" />
          <rect x="44" y="52" width="12" height="16" rx="6" fill="#E8B99D" />
          <ellipse cx="50" cy="42" rx="16" ry="18" fill="#F5D0C5" />
          <path d="M34 40C34 28 42 22 50 22C58 22 66 28 66 38C66 41 64 36 62 33C58 29 42 29 38 34C36 36 34 42 34 40Z" fill="#282B29" />
          <circle cx="44" cy="42" r="1.75" fill="#282B29" />
          <circle cx="56" cy="42" r="1.75" fill="#282B29" />
          <path d="M47 48C48.5 50 51.5 50 53 48" stroke="#B94736" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
  }
};

export interface CareerPilotAvatarProps {
  avatarId?: string | null;
  className?: string;
  size?: number | string;
  alt?: string;
}

export const CareerPilotAvatar: React.FC<CareerPilotAvatarProps> = ({
  avatarId,
  className = 'w-10 h-10 rounded-2xl',
  size,
}) => {
  return <CareerPilotAvatarSvg id={avatarId || DEFAULT_AVATAR_ID} className={className} size={size} />;
};

export interface AvatarSelectorProps {
  selectedId?: string | null;
  selectedAvatarId?: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

export const AvatarSelector: React.FC<AvatarSelectorProps> = ({
  selectedId,
  selectedAvatarId,
  onSelect,
  className = '',
}) => {
  const current = normalizeAvatarId(selectedId ?? selectedAvatarId);

  return (
    <div
      role="radiogroup"
      aria-label="Choose your CareerPilot avatar"
      className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 ${className}`}
    >
      {CAREERPILOT_AVATARS.map((avatar) => {
        const isSelected = avatar.id === current;
        return (
          <button
            key={avatar.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${avatar.name} avatar: ${avatar.description}`}
            onClick={() => onSelect(avatar.id)}
            className={`group relative p-2 rounded-2xl border transition-all duration-200 text-start focus:outline-hidden focus:ring-2 focus:ring-[var(--accent-primary)] ${
              isSelected
                ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] shadow-xs scale-102 ring-1 ring-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--border-strong)] hover:shadow-xs'
            }`}
          >
            <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-1.5">
              <CareerPilotAvatarSvg id={avatar.id} className="w-full h-full object-cover" />
              {isSelected && (
                <div className="absolute top-1 end-1 w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center shadow-xs">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </div>
            <div className="text-center">
              <span className={`block text-xs font-semibold truncate ${
                isSelected ? 'text-[var(--color-primary-text)] font-bold' : 'text-[var(--text-primary)]'
              }`}>
                {avatar.name}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
