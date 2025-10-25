import React from "react";

const PreviewModal = ({ title = "Preview", children, onClose }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-8 rounded-lg shadow-lg relative max-w-lg w-full">
        {/* Title */}
        <h3 className="text-xl font-semibold mb-4 text-center">{title}</h3>

        {/* Render whatever is passed as children */}
        <div className="border border-gray-200 rounded-md p-4 overflow-auto max-h-[70vh]">
          {children}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-lg font-bold"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default PreviewModal;
