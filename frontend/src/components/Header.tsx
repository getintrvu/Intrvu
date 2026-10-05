import React from 'react';
import Logo from './Logo';
import { X } from 'lucide-react';
import { FRAME_MESSAGES } from '../extension/constants';

const Header: React.FC = () => {
  const handleClose = () => {
    // The panel lives in an iframe on the LinkedIn page; ask that page to hide it. Target the
    // embedding page's origin explicitly instead of '*'.
    const parentOrigin = window.location.ancestorOrigins?.[0];
    if (parentOrigin) window.parent.postMessage({ type: FRAME_MESSAGES.closePanel }, parentOrigin);
  };

  return (
    <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
      <Logo />
      <button
        onClick={handleClose}
        className="group rounded-full p-1.5 text-gray-400 transition-all duration-200 hover:bg-red-50 hover:text-red-500"
        title="Close"
        aria-label="Close panel"
      >
        <X className="h-5 w-5 transition-transform group-active:scale-95" />
      </button>
    </header>
  );
};

export default Header;
