'use client'

import LoadingSkeleton from '@/components/LoadingSkeleton'
import { supabase } from '@/lib/supabase/client'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Home() {
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error) console.warn('Auth error:', error.message)
      if (data.user) router.push('/home')
      setCheckingSession(false)
    }

    checkSession()
  }, [router])

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
    }
  }

  if (checkingSession) {
    return <LoadingSkeleton />
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Logo (optional replace with your own) */}
        {/* <div className="flex justify-center">
          <Image
            src="/logo.svg"
            alt="Asenso Logo"
            width={120}
            height={40}
            priority
          />
        </div> */}

        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome to Family Census App
        </h1>
        <p className="text-sm text-gray-600">To get started, please sign in</p>

        {errorMessage && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
            {errorMessage}
          </div>
        )}

        {/* Google Login Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full border border-gray-300 rounded-md py-2 px-4 flex items-center justify-center gap-2 text-gray-800 bg-white hover:bg-gray-100 transition disabled:opacity-60"
        >
          <Image
            src="/icons8-google-100.svg"
            alt="Google"
            width={20}
            height={20}
          />
          {isLoading ? 'Redirecting...' : 'Continue with Google'}
        </button>

        {/* <div className="flex items-center gap-4">
          <hr className="flex-grow border-gray-200" />
          <span className="text-xs text-gray-500">or</span>
          <hr className="flex-grow border-gray-200" />
        </div>

        
        <input
          type="email"
          disabled
          placeholder="Email address"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <button
          disabled
          className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60"
        >
          Continue
        </button>


        <p className="text-xs text-gray-400 mt-6">
          <Link
            href="/privacy-policy"
            className="hover:underline text-gray-500"
          >
            Privacy Policy
          </Link>{' '}
          &nbsp;•&nbsp;{' '}
          <Link href="/terms" className="hover:underline text-gray-500">
            Terms
          </Link>
        </p> */}
      </div>
    </main>
  )
}
