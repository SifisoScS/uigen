import Counter from "./components/Counter.tsx";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <Counter />
      </div>
    </div>
  );
}
