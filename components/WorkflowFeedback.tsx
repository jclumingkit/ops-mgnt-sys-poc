import { cn } from "cn"

export type Feedback = { tone: "success" | "error"; message: string }

export const WorkflowFeedback = ({ feedback, id, className }: {
  feedback: Feedback | null
  id?: string
  className?: string
}) => feedback && (
  <div
    id={id}
    role={feedback.tone === "error" ? "alert" : "status"}
    className={cn(
      "rounded-lg border px-4 py-3 text-sm leading-6",
      feedback.tone === "error"
        ? "border-destructive/20 bg-destructive/5 text-destructive"
        : "border-primary/20 bg-primary/5 text-primary",
      className,
    )}
  >
    {feedback.message}
  </div>
)
