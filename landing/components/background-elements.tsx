"use client"

import { useEffect, useState } from "react"

export function BackgroundElements() {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <>
      {/* Fixed background elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Gradient orbs */}
        <div
          className="absolute top-[10%] right-[5%] w-[300px] h-[300px] rounded-full bg-gradient-to-r from-primary/10 to-purple-600/10 blur-[80px] opacity-70"
          style={{
            transform: `translate(${scrollY * 0.02}px, ${scrollY * -0.01}px) rotate(${scrollY * 0.02}deg)`,
          }}
        />
        <div
          className="absolute top-[40%] left-[10%] w-[400px] h-[400px] rounded-full bg-gradient-to-r from-amber-500/10 to-pink-600/10 blur-[100px] opacity-60"
          style={{
            transform: `translate(${scrollY * -0.03}px, ${scrollY * 0.02}px) rotate(${scrollY * -0.03}deg)`,
          }}
        />
        <div
          className="absolute bottom-[15%] right-[15%] w-[350px] h-[350px] rounded-full bg-gradient-to-r from-teal-500/10 to-blue-600/10 blur-[90px] opacity-60"
          style={{
            transform: `translate(${scrollY * 0.01}px, ${scrollY * 0.03}px) rotate(${scrollY * 0.01}deg)`,
          }}
        />

        {/* SVG patterns */}
        <svg
          className="absolute top-[20%] left-[20%] w-[200px] h-[200px] text-primary/5 opacity-70"
          style={{
            transform: `rotate(${scrollY * 0.05}deg)`,
          }}
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="2" fill="none" />
          <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="2" fill="none" />
          <circle cx="50" cy="50" r="20" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>

        <svg
          className="absolute bottom-[30%] right-[25%] w-[150px] h-[150px] text-purple-600/5 opacity-70"
          style={{
            transform: `rotate(${-scrollY * 0.03}deg)`,
          }}
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon points="50,10 90,90 10,90" stroke="currentColor" strokeWidth="2" fill="none" />
          <polygon points="50,20 80,80 20,80" stroke="currentColor" strokeWidth="2" fill="none" />
          <polygon points="50,30 70,70 30,70" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>

        <svg
          className="absolute top-[60%] left-[5%] w-[180px] h-[180px] text-amber-500/5 opacity-70"
          style={{
            transform: `rotate(${scrollY * 0.02}deg)`,
          }}
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="20" y="20" width="60" height="60" stroke="currentColor" strokeWidth="2" fill="none" />
          <rect x="30" y="30" width="40" height="40" stroke="currentColor" strokeWidth="2" fill="none" />
          <rect x="40" y="40" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>

        {/* Dots grid */}
        <div
          className="absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0.03)_1px,_transparent_1px)] bg-[length:20px_20px] opacity-30"
          style={{
            transform: `translateY(${scrollY * 0.1}px)`,
          }}
        />
      </div>

      {/* Foreground elements that interact with scrolling */}
      <div className="fixed inset-0 pointer-events-none z-20 overflow-hidden">
        <div
          className="absolute top-[30%] left-[50%] w-4 h-4 rounded-full bg-primary/20 blur-sm"
          style={{
            transform: `translate(${scrollY * -0.5}px, ${scrollY * 0.2}px)`,
            opacity: Math.max(0, 1 - scrollY * 0.001),
          }}
        />
        <div
          className="absolute top-[40%] right-[40%] w-6 h-6 rounded-full bg-purple-600/20 blur-sm"
          style={{
            transform: `translate(${scrollY * 0.3}px, ${scrollY * 0.4}px)`,
            opacity: Math.max(0, 1 - scrollY * 0.001),
          }}
        />
        <div
          className="absolute bottom-[35%] left-[35%] w-5 h-5 rounded-full bg-amber-500/20 blur-sm"
          style={{
            transform: `translate(${scrollY * -0.2}px, ${scrollY * -0.3}px)`,
            opacity: Math.max(0, 1 - scrollY * 0.001),
          }}
        />
      </div>
    </>
  )
}

