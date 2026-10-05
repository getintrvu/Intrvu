import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';

interface AvatarProps {
  /** The profile picture URL from the sign-in provider, if there is one. */
  url?: string | null;
  /** Used for the fallback initial and the accessible description. */
  name?: string | null;
  className?: string;
}

/** Only https images are loaded: the URL comes from the sign-in provider's profile data. */
const safeUrl = (url?: string | null) => (url && /^https:\/\//i.test(url) ? url : null);

/** A round profile picture. Falls back to the person's initial, or a generic icon, when there is no
 * picture or it cannot be loaded. */
const Avatar: React.FC<AvatarProps> = ({ url, name, className = 'h-10 w-10' }) => {
  const source = safeUrl(url);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [source]); // a new picture gets a fresh chance to load

  const base = `${className} flex-shrink-0 overflow-hidden rounded-full`;

  if (source && !failed) {
    return (
      <img
        src={source}
        alt={name ? `${name}'s profile picture` : 'Profile picture'}
        className={`${base} object-cover`}
        // Google's picture hosts can refuse requests that carry a referrer.
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }

  const initial = (name ?? '').trim().charAt(0).toUpperCase();
  return (
    <span className={`${base} flex items-center justify-center bg-[#eef2ff] text-sm font-bold text-[#4f46e5]`} aria-hidden="true">
      {initial || <User className="h-5 w-5 text-gray-500" />}
    </span>
  );
};

export default Avatar;
