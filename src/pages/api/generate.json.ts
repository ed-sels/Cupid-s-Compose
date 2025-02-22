import { withRateLimit } from '@/lib/rate-limiter';
import { sanitizeInput, sanitizePrompt } from '@/lib/sanitize';
import type { APIRoute } from 'astro';
import { Groq } from 'groq-sdk';
import { z } from 'zod';

const RequestSchema = z.object({
  recipient: z
    .string()
    .min(1, 'Recipient name is required')
    .max(50, 'Recipient name too long')
    .transform(sanitizeInput),
  relationship: z.enum(['partner', 'crush', 'spouse'], {
    errorMap: () => ({ message: 'Invalid relationship type' }),
  }),
  tone: z.enum(['romantic', 'playful', 'poetic'], {
    errorMap: () => ({ message: 'Invalid tone selection' }),
  }),
  details: z
    .string()
    .max(500, 'Details too long')
    .optional()
    .transform((val) => (val ? sanitizeInput(val) : '')),
});

const groq = new Groq({
  apiKey: import.meta.env.GROQ_API_KEY,
});

const safetyPrompt: string = `You are a respectful love note writer. Make the notes less generic and refine the note to look like a human speaking. Keep the content tasteful and appropriate. 
Do not include any explicit or inappropriate content. Focus on expressing genuine emotions and feelings. Humanize the note after generating it.
Never include contact information, addresses, or specific locations.
Avoid any harmful, offensive, or discriminatory content. Keep notes as short as possible. Notes shouldn't be more than 50 words.`;

export const POST: APIRoute = withRateLimit(async ({ request }) => {
  try {
    const rawData = await request.json();
    if (!rawData) {
      throw new Error('Request body is empty');
    }

    const data = RequestSchema.parse(rawData);
    const { recipient, relationship, tone, details } = data;

    const userPrompt = `Write a ${tone} love letter to my ${relationship} named ${recipient}. ${
      details ? `Include these details: ${details}` : ''
    }`;

    const sanitizedPrompt = sanitizePrompt(`${safetyPrompt}\n\n${userPrompt}`);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: safetyPrompt,
        },
        {
          role: 'user',
          content: sanitizedPrompt,
        },
      ],
      model: 'mixtral-8x7b-32768',
      temperature: 0.7,
      max_tokens: 1000,
    });

    const sanitizedResponse = sanitizePrompt(completion.choices[0].message.content || '');

    const response = {
      letter: sanitizedResponse,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
    });
  } catch (error) {
    const errorResponse = {
      error:
        error instanceof z.ZodError
          ? error.errors.map((e) => e.message).join(', ')
          : error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
    };

    return new Response(JSON.stringify(errorResponse), {
      status: error instanceof z.ZodError ? 400 : 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
});

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};
