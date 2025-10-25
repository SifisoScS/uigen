import { useState } from "react";
import PreviewModal from "./PreviewModal";

const Counter = () => {
  const [count, setCount] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const increment = () => setCount(count + 1);
  const decrement = () => setCount(count - 1);
  const reset = () => setCount(0);

  return (
    <div className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Counter</h2>
      <div className="text-4xl font-bold mb-6">{count}</div>

      <div className="flex gap-4 mb-4">
        <button
          onClick={decrement}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          Decrease
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
        >
          Reset
        </button>
        <button
          onClick={increment}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
        >
          Increase
        </button>
      </div>

      {/* ✅ Reusable Preview Button */}
      <button
        onClick={() => setShowPreview(true)}
        className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        Preview Component
      </button>

      {/* ✅ Use the reusable modal */}
      {showPreview && (
        <PreviewModal title="Counter Preview" onClose={() => setShowPreview(false)}>
          <div className="flex flex-col items-center">
            <div className="text-3xl font-bold mb-2">{count}</div>
            <div className="flex gap-4">
              <button
                onClick={decrement}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
              >
                -
              </button>
              <button
                onClick={reset}
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition"
              >
                0
              </button>
              <button
                onClick={increment}
                className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition"
              >
                +
              </button>
            </div>
          </div>
        </PreviewModal>
      )}
    </div>
  );
};

export default Counter;
