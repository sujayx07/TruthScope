"use client"

import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function WorkflowSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
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

  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % workflowSteps.length)
    }, 3000)

    return () => clearInterval(interval)
  }, [isVisible])

  const workflowSteps = [
    {
      title: "Install Extension",
      description: "Add TruthScope to your Chrome browser with just one click.",
      color: "from-blue-500 to-blue-600",
    },
    {
      title: "Browse Normally",
      description: "Continue your regular browsing habits without interruption.",
      color: "from-purple-500 to-purple-600",
    },
    {
      title: "Receive Alerts",
      description: "Get notified when TruthScope detects potentially misleading content.",
      color: "from-amber-500 to-amber-600",
    },
    {
      title: "View Analysis",
      description: "Click on alerts to see detailed analysis of the content's credibility.",
      color: "from-green-500 to-green-600",
    },
    {
      title: "Make Informed Decisions",
      description: "Use TruthScope's insights to determine what content to trust.",
      color: "from-red-500 to-red-600",
    },
  ]

  return (
    <section id="workflow" className="py-20 min-h-screen flex items-center" ref={sectionRef}>
      <div
        className={cn(
          "container transition-all duration-1000 transform",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        )}
      >
        <div className="text-center mb-16">
          <Badge className="mb-4 px-3 py-1 text-sm bg-gradient-to-r from-primary/20 to-purple-600/20 hover:from-primary/30 hover:to-purple-600/30 transition-colors">
            How It Works
          </Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4">
            Your Journey with{" "}
            <span className="p-0.5 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent animate-gradient">
              TruthScope
            </span>
          </h2>
          <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
            A simple workflow that seamlessly integrates with your browsing experience.
          </p>
        </div>

        <div className="relative max-w-4xl mx-auto py-20">
          {/* Curved dotted line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 border-t-2 border-dashed border-muted z-0" />

          {/* Workflow steps */}
          <div className="relative z-10 flex justify-between">
            {workflowSteps.map((step, index) => (
              <div
                key={index}
                className={cn(
                  "relative flex flex-col items-center transition-all duration-500",
                  activeStep === index ? "scale-110" : "scale-100",
                )}
                style={{
                  transform: `translateY(${activeStep === index ? "-10px" : "0"})`,
                }}
              >
                {/* Step number bubble */}
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold mb-4 shadow-lg transition-all duration-500",
                    activeStep === index ? `bg-gradient-to-r ${step.color}` : "bg-muted text-foreground/50",
                  )}
                >
                  {index + 1}
                </div>

                {/* Step content */}
                <div
                  className={cn(
                    "absolute top-16 w-48 text-center transition-all duration-500",
                    activeStep === index ? "opacity-100 transform-none" : "opacity-50 scale-95",
                  )}
                  style={{
                    transform: `translateY(${activeStep === index ? "0" : "10px"})`,
                  }}
                >
                  <h3
                    className={cn(
                      "font-bold mb-1 transition-colors duration-500",
                      activeStep === index
                        ? "bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent"
                        : "text-foreground",
                    )}
                  >
                    {step.title}
                  </h3>
                  <p className="text-sm text-foreground/70">{step.description}</p>
                </div>

                {/* Animated pulse for active step */}
                {activeStep === index && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-primary/20 animate-ping" />
                )}
              </div>
            ))}
          </div>

          {/* Animated progress indicator */}
          <div
            className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-primary to-purple-600 z-0 transition-all duration-300"
            style={{
              width: `${(activeStep / (workflowSteps.length - 1)) * 100}%`,
              transform: "translateY(-50%)",
            }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex justify-center mt-16 gap-2">
          {workflowSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveStep(index)}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                activeStep === index ? "w-8 bg-primary" : "w-2 bg-muted hover:bg-muted-foreground/50",
              )}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

