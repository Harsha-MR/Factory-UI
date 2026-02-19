import { useNavigate } from 'react-router-dom'

export default function HomePage() {
  const navigate = useNavigate()

  const handleOverlookClick = () => {
    navigate('/dashboard')
  }

  return (
    <div className="flex   flex-col pt-10 bg-gradient-to-b from-black-950 via-blue-900 to-blue-950 px-4 py-3">
      {/* Monitoring Section */}
      <div className="mb-3 flex items-center rounded-xl font-serif bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-4 shadow-lg">
        <h2 className="min-w-[140px] text-2xl font-bold text-white">Monitoring</h2>
        <div className="ml-8 flex flex-1 items-center justify-around gap-4">
          {/* Overlook */}
          <button
            onClick={handleOverlookClick}
            className="group flex flex-col items-center gap-2 transition-all hover:scale-105"
          >
            <div className="relative">
              <svg className="h-16 w-16 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {/* <svg className="absolute -right-1 -top-1 h-5 w-5 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
              </svg> */}
            </div>
            <span className="text-sm font-medium text-white">Overlook</span>
          </button>

          {/* Group monitoring */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <div className="relative">
              <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {/* <svg className="absolute -right-1 -top-1 h-5 w-5 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
              </svg> */}
            </div>
            <span className="text-sm font-medium text-white">Group monitoring</span>
          </div>

          {/* Equipment monitoring */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <div className="relative">
              <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {/* <svg className="absolute -right-1 -top-1 h-5 w-5 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
              </svg> */}
            </div>
            <span className="text-sm font-medium text-white">Equipment monitoring</span>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="mb-3 flex items-center rounded-xl font-serif bg-gradient-to-r from-teal-700 to-teal-600 px-6 py-4 shadow-lg">
        <h2 className="min-w-[140px] text-2xl font-bold text-white">Results</h2>
        <div className="ml-8 flex flex-1 items-center justify-around gap-4">
          {/* Group results */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            <span className="text-sm font-medium text-white">Group results</span>
          </div>

          {/* Operational results */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium text-white">Operational results</span>
          </div>

          {/* Production results */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium text-white">Production results</span>
          </div>
        </div>
      </div>

      {/* Diagnosis Section */}
      <div className="mb-3 flex items-center rounded-xl font-serif bg-gradient-to-r from-purple-700 to-fuchsia-700 px-6 py-4 shadow-lg">
        <h2 className="min-w-[140px] text-2xl font-bold text-white">Diagnosis</h2>
        <div className="ml-8 flex flex-1 items-center justify-around gap-4">
          {/* Alarm History */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <div className="relative">
              <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {/* <svg className="absolute -right-1 -top-1 h-5 w-5 text-pink-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg> */}
            </div>
            <span className="text-sm font-medium text-white">Alarm History</span>
          </div>

          {/* Program History */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <div className="relative">
              <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {/* <svg className="absolute -right-1 -top-1 h-5 w-5 text-pink-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg> */}
            </div>
            <span className="text-sm font-medium text-white">Program History</span>
          </div>

          {/* Signal History */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <div className="relative">
              <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {/* <svg className="absolute -right-1 -top-1 h-5 w-5 text-pink-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg> */}
            </div>
            <span className="text-sm font-medium text-white">Signal History</span>
          </div>
        </div>
      </div>

      {/* Utility Section */}
      <div className="mb-3 flex items-center rounded-xl font-serif bg-gradient-to-r from-slate-700 to-slate-600 px-6 py-4 shadow-lg">
        <h2 className="min-w-[140px] text-2xl font-bold text-white">Utility</h2>
        <div className="ml-8 flex flex-1 items-center justify-around gap-4">
          {/* File Transfer */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span className="text-sm font-medium text-white">File Transfer</span>
          </div>

          {/* Integration Server */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            <span className="text-sm font-medium text-white">Integration Server</span>
          </div>

          {/* System Diagnosis */}
          <div className="flex flex-col items-center gap-2 opacity-50">
            <svg className="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-sm font-medium text-white">System Diagnosis</span>
          </div>
        </div>
      </div>
    </div>
  )
}
