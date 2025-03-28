"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react"
import { cn } from "@/lib/utils"

export function TestimonialsSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [activeTestimonial, setActiveTestimonial] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const sectionRef = useRef<HTMLElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)

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
    const interval = setInterval(() => {
      if (!isDragging) {
        setActiveTestimonial((prev) => (prev + 1) % testimonials.length)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [isDragging])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setStartX(e.pageX - (sliderRef.current?.offsetLeft || 0))
    setScrollLeft(sliderRef.current?.scrollLeft || 0)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    const x = e.pageX - (sliderRef.current?.offsetLeft || 0)
    const walk = (x - startX) * 2
    if (sliderRef.current) {
      sliderRef.current.scrollLeft = scrollLeft - walk
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    if (sliderRef.current) {
      const cardWidth = sliderRef.current.clientWidth
      const scrollPosition = sliderRef.current.scrollLeft
      const newIndex = Math.round(scrollPosition / cardWidth)
      setActiveTestimonial(Math.max(0, Math.min(newIndex, testimonials.length - 1)))

      // Smooth scroll to the active testimonial
      sliderRef.current.scrollTo({
        left: newIndex * cardWidth,
        behavior: "smooth",
      })
    }
  }

  const handlePrev = () => {
    setActiveTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length)
  }

  const handleNext = () => {
    setActiveTestimonial((prev) => (prev + 1) % testimonials.length)
  }

  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "Journalist",
      content:
        "TruthScope has completely transformed how I verify news sources. It's an essential tool for any journalist in today's digital landscape.",
      avatar: "/placeholder.svg?height=80&width=80",
      rating: 5,
      publication: "The Daily Chronicle",
    },
    {
      name: "Michael Chen",
      role: "College Professor",
      content:
        "I recommend TruthScope to all my students. It helps them develop critical thinking skills and identify misinformation effectively.",
      avatar: "/placeholder.svg?height=80&width=80",
      rating: 5,
      publication: "State University",
    },
    {
      name: "Emily Rodriguez",
      role: "Social Media Manager",
      content:
        "This extension has saved me countless times from sharing unverified content. The real-time analysis is incredibly accurate and has become an essential part of my workflow.",
      avatar: "/placeholder.svg?height=80&width=80",
      rating: 5,
      publication: "TechConnect",
    },
    {
      name: "David Wilson",
      role: "High School Teacher",
      content:
        "Teaching media literacy has never been easier. TruthScope gives my students practical experience in evaluating online information critically.",
      avatar: "/placeholder.svg?height=80&width=80",
      rating: 4,
      publication: "Central High School",
    },
    {
      name: "Priya Patel",
      role: "Digital Marketing Specialist",
      content:
        "The bias detection feature is a game-changer. It helps me understand different perspectives and create more balanced content for our audience.",
      avatar: "/placeholder.svg?height=80&width=80",
      rating: 5,
      publication: "Global Marketing Solutions",
    },
  ]

  return (
    <section id="testimonials" className="py-20" ref={sectionRef}>
      <div
        className={cn(
          "container transition-all duration-1000 transform",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        )}
      >
        <div className="text-center mb-16">
          <Badge className="mb-4 px-3 py-1 text-sm bg-gradient-to-r from-primary/20 to-purple-600/20 hover:from-primary/30 hover:to-purple-600/30 transition-colors">
            Testimonials
          </Badge>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4">
            What Our Users Say About{" "}
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              TruthScope
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Hear from our users who rely on TruthScope to navigate the complex information landscape.
          </p>
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="absolute top-1/2 left-4 -translate-y-1/2 z-30 md:flex hidden" onClick={handlePrev}>
            <button
              className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shadow-lg"
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>

          <div className="absolute top-1/2 right-4 -translate-y-1/2 z-30 md:flex hidden" onClick={handleNext}>
            <button
              className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shadow-lg"
              aria-label="Next testimonial"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div
            ref={sliderRef}
            className={cn("overflow-hidden", isDragging ? "cursor-grabbing" : "cursor-grab")}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${activeTestimonial * 100}%)` }}
            >
              {testimonials.map((testimonial, index) => (
                <div key={index} className="min-w-full px-4">
                  <Card className="border-none shadow-lg bg-muted/30 overflow-hidden">
                    <CardContent className="p-8 relative">
                      <Quote className="absolute top-4 right-4 h-12 w-12 text-muted/10" />
                      <div className="flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left">
                        <div className="relative">
                          <div className="h-20 w-20 rounded-full overflow-hidden border-4 border-background shadow-xl">
                            <Image
                              src={testimonial.avatar || "/placeholder.svg"}
                              alt={testimonial.name}
                              width={80}
                              height={80}
                              className="object-cover"
                            />
                          </div>
                          <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-1 shadow-md">
                            <div className="bg-gradient-to-r from-primary to-purple-600 rounded-full p-1">
                              <Star className="h-3 w-3 text-white fill-white" />
                            </div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="mb-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "inline-block h-5 w-5 mr-1",
                                  i < testimonial.rating ? "text-amber-400 fill-amber-400" : "text-muted fill-muted",
                                )}
                              />
                            ))}
                          </div>
                          <p className="text-xl mb-4 italic">"{testimonial.content}"</p>
                          <div>
                            <div className="font-bold text-lg">{testimonial.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {testimonial.role}, {testimonial.publication}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center mt-6 gap-2">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveTestimonial(index)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  activeTestimonial === index
                    ? "w-8 bg-primary"
                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                )}
                aria-label={`Go to testimonial ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

