import React, { useEffect } from "react";

interface PreviewModalProps {
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ title = "Preview", children, onClose }) => {
  useEffect(() => {
    // Prevent background scrolling when modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white p-8 rounded-lg shadow-lg relative max-w-lg w-full">
        {/* Title */}
        <h3 id="modal-title" className="text-xl font-semibold mb-4 text-center">{title}</h3>

        {/* Render whatever is passed as children */}
        <div className="border border-gray-200 rounded-md p-4 overflow-auto max-h-[70vh]">
          {children}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-lg font-bold"
          aria-label="Close modal"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default PreviewModal;
