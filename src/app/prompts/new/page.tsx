import { BackLink } from "@/components/back-link";
import { PromptForm } from "@/components/prompt-form";

export default function NewPromptPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <BackLink />
      <h1 className="mt-4 mb-6 text-2xl font-semibold tracking-tight">
        New Prompt
      </h1>
      <PromptForm mode="create" />
    </main>
  );
}
