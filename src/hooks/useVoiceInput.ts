import { useRef, useState, useCallback, useEffect } from 'react'

// Minimal type declarations for Web Speech API (not in standard TS DOM lib)
interface SpeechRecognitionResultLike {
  0: { transcript: string }
  length: number
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { [index: number]: SpeechRecognitionResultLike; length: number }
}

interface SpeechRecognitionErrorEventLike {
  error: string
  message: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function useVoiceInput(onTranscript: (text: string, isFinal: boolean) => void) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalTranscriptRef = useRef('')
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      setSupported(false)
      return false
    }

    const recognition = new Ctor()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    finalTranscriptRef.current = ''

    recognition.onstart = () => {
      setListening(true)
    }

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.length > 0 && result[0]) {
          // Treat as interim unless it's the last result
          interim += transcript
        }
      }
      // Build full text: previous finals + current interim
      const fullText = finalTranscriptRef.current + interim
      onTranscriptRef.current(fullText, false)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      console.error('Speech recognition error:', event.error)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setSupported(false)
      }
    }

    recognition.onend = () => {
      // Capture final transcript from last session
      setListening(false)
      recognitionRef.current = null
      // Notify final
      onTranscriptRef.current(finalTranscriptRef.current, true)
    }

    recognition.start()
    recognitionRef.current = recognition
    return true
  }, [])

  const toggle = useCallback(() => {
    if (listening) {
      stop()
    } else {
      start()
    }
  }, [listening, start, stop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  return { listening, supported, start, stop, toggle }
}