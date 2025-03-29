"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function CtaSection() {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1 },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current)
      }
    }
  }, [])

  return (
    <section className="py-20" ref={sectionRef}>
      <div
        className={cn(
          "container transition-all duration-1000 transform",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        )}
      >
        <div className="relative overflow-hidden rounded-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-950 to-purple-600 opacity-100" />
          <div className="absolute inset-0 bg-grid-pattern opacity-10" />

          <div
            className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse-slow"
            style={{ animationDuration: "8s" }}
          />
          <div
            className="absolute -bottom-24 -left-24 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse-slow"
            style={{ animationDuration: "10s", animationDelay: "1s" }}
          />

          <div className="relative z-10 px-6 py-16 md:px-12 md:py-24 lg:py-32 text-center">
            <h2
              className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-6 text-white"
              style={{
                textShadow: "0 2px 10px rgba(0,0,0,0.1)",
              }}
            >
              Start Browsing with Confidence Today
            </h2>
            <p className="text-xl text-white/80 max-w-2xl mx-auto mb-8">
              Join thousands of users who trust TruthScope to help them navigate the complex information landscape.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                variant="secondary"
                className="bg-white text-primary hover:bg-white/90 group shadow-lg hover:shadow-xl transition-all duration-300"
              >
                Add to Chrome
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-white text-primary hover:bg-white/90 group shadow-lg hover:shadow-xl transition-all duration-300"
              >
                Learn More
              </Button>
            </div>

            <div className="mt-12 flex flex-wrap justify-center gap-8">
              <div
                className="flex flex-col items-center transform transition-transform duration-500 hover:scale-110"
                style={{
                  transform: isVisible ? "translateY(0)" : "translateY(20px)",
                  opacity: isVisible ? 1 : 0,
                  transition: "transform 0.5s ease-out, opacity 0.5s ease-out",
                  transitionDelay: "0.1s",
                }}
              >
                <div className="text-3xl font-bold text-white mb-1">10+</div>
                <div className="text-white/70">Active Users</div>
              </div>
              <div
                className="flex flex-col items-center transform transition-transform duration-500 hover:scale-110"
                style={{
                  transform: isVisible ? "translateY(0)" : "translateY(20px)",
                  opacity: isVisible ? 1 : 0,
                  transition: "transform 0.5s ease-out, opacity 0.5s ease-out",
                  transitionDelay: "0.2s",
                }}
              >
                <div className="text-3xl font-bold text-white mb-1">5+</div>
                <div className="text-white/70">5-Star Reviews</div>
              </div>
              <div
                className="flex flex-col items-center transform transition-transform duration-500 hover:scale-110"
                style={{
                  transform: isVisible ? "translateY(0)" : "translateY(20px)",
                  opacity: isVisible ? 1 : 0,
                  transition: "transform 0.5s ease-out, opacity 0.5s ease-out",
                  transitionDelay: "0.3s",
                }}
              >
                <div className="text-3xl font-bold text-white mb-1">1M+</div>
                <div className="text-white/70">Articles Analyzed</div>
              </div>
              <div
                className="flex flex-col items-center transform transition-transform duration-500 hover:scale-110"
                style={{
                  transform: isVisible ? "translateY(0)" : "translateY(20px)",
                  opacity: isVisible ? 1 : 0,
                  transition: "transform 0.5s ease-out, opacity 0.5s ease-out",
                  transitionDelay: "0.4s",
                }}
              >
                <div className="text-3xl font-bold text-white mb-1">97.6%</div>
                <div className="text-white/70">Accuracy Rate</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

