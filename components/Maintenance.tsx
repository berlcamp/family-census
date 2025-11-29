export default function Maintenance() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6 text-center">
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full">
        <h1 className="text-3xl font-bold mb-4">System Under Maintenance</h1>
        <p className="text-base mb-6">
          Our system is currently undergoing scheduled maintenance. Please check
          back later.
        </p>
        <div className="animate-pulse text-gray-500 text-sm">
          Thank you for your patience.
        </div>
      </div>
    </div>
  )
}
