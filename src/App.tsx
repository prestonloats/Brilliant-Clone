import { useEffect, useState } from 'react'
import './App.css'
import { BackendConfigurationError } from './app/BackendConfigurationError'
import { LearningApp } from './app/LearningApp'
import { LoadingScreen } from './app/LoadingScreen'
import { initializeBackend, type BackendStartup } from './app/startup'

function App() {
  const [startup, setStartup] = useState<BackendStartup>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    initializeBackend().then((result) => {
      if (!cancelled) {
        setStartup(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (startup.status === 'loading') {
    return <LoadingScreen message="Starting backend..." />
  }

  if (startup.status === 'error') {
    return <BackendConfigurationError startup={startup} />
  }

  return <LearningApp backend={startup.backend} />
}

export default App
