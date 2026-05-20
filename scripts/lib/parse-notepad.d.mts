export interface ParsedNotepad {
    deferredQuestionsCount: number
    deferredQuestionsPreview?: string
    storyDoctorInterventions: number
}

export function parseNotepad(text: string): ParsedNotepad
