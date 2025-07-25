import { type RefObject, useCallback, useEffect, useState } from "react"
import scrollIntoView from "smooth-scroll-into-view-if-needed"

const MIN_STICK_DISTANCE = 12

export function useSmartAutoscroll(
  ref: RefObject<HTMLElement | null>,
): () => void {
  const [isStuck, setIsStuck] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleScroll = () => {
      const isAtBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight <= MIN_STICK_DISTANCE
      setIsStuck(isAtBottom)
    }

    handleScroll() // Initial check

    el.addEventListener("scroll", handleScroll)
    return () => {
      el.removeEventListener("scroll", handleScroll)
    }
  }, [ref.current])

  const scrollToEnd = useCallback(() => {
    const container = ref.current
    console.log("scrollToEnd", container, container?.lastElementChild, isStuck)
    if (isStuck && container) {
      const lastElement = container.lastElementChild
      if (lastElement) {
        scrollIntoView(lastElement, {
          behavior: "smooth",
          scrollMode: "if-needed",
          block: "end",
        })
      }
    }
  }, [isStuck, ref.current])

  return scrollToEnd
}
