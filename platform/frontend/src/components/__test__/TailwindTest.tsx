/**
 * TailwindCSS Test Component
 * Used to verify TailwindCSS is working correctly
 */
export default function TailwindTest() {
  return (
    <div className="p-6 bg-blue-500 text-white rounded-lg shadow-lg">
      <h1 className="text-3xl font-bold mb-4">TailwindCSS Test</h1>
      <p className="text-lg">
        If you see this with blue background and white text, TailwindCSS is working!
      </p>
      <button className="mt-4 px-4 py-2 bg-white text-blue-500 rounded hover:bg-blue-100 transition">
        Hover Me
      </button>
    </div>
  );
}
