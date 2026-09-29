import React, { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// M14 product reviews (adapted stack: Supabase + Vercel serverless).
// Public approved list + average via GET /api/reviews?sku=; logged-in users
// post via POST (pending moderation, verified purchase required server-side).
// Graceful: failures hide the section instead of breaking the product view.
// Rollback: remove <ProductReviews/> from UnwrappingModalView; shop unaffected.

export interface ApprovedReviewView {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
}

function Stars({ value, size = 'w-3.5 h-3.5' }: { value: number; size?: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${size} ${n <= Math.round(value) ? 'text-[#8a6216] dark:text-[#f1c40f] fill-[#f1c40f]' : 'text-[#6b5546]'}`}
        />
      ))}
    </span>
  );
}

export const ProductReviews: React.FC<{ sku: string }> = ({ sku }) => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ApprovedReviewView[]>([]);
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [errorEs, setErrorEs] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setFailed(false);
    try {
      const res = await fetch(`/api/reviews?sku=${encodeURIComponent(sku)}`);
      if (res.status === 503) return; // 005 not applied yet: stay silent.
      const data = (await res.json()) as { reviews?: ApprovedReviewView[]; average?: number; count?: number };
      if (!res.ok || !Array.isArray(data.reviews)) {
        setFailed(true);
        return;
      }
      setReviews(data.reviews);
      setAverage(typeof data.average === 'number' ? data.average : 0);
      setCount(typeof data.count === 'number' ? data.count : data.reviews.length);
    } catch {
      setFailed(true);
    }
  }, [sku]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(): Promise<void> {
    if (user === null || sending) return;
    setSending(true);
    setErrorEs(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, sku, rating, comment }),
      });
      const data = (await res.json().catch(() => null)) as { error_es?: string } | null;
      if (!res.ok) {
        setErrorEs(data?.error_es ?? 'No se pudo guardar tu opinión');
        return;
      }
      setComment('');
      setOkMsg('¡Gracias! Tu opinión está pendiente de moderación.');
    } catch {
      setErrorEs('No se pudo guardar tu opinión');
    } finally {
      setSending(false);
    }
  }

  if (failed) return null;

  return (
    <section aria-label="Opiniones del producto" className="mb-5">
      <h4 className="text-xs font-bold uppercase tracking-wider text-[#d4af37] mb-2">
        Opiniones {count > 0 && <span className="text-[#7a5c48] dark:text-[#bda393] normal-case">({count})</span>}
      </h4>
      {count > 0 ? (
        <div className="flex items-center gap-2 mb-3">
          <Stars value={average} />
          <span className="text-xs font-bold text-[#2b1a12] dark:text-[#fcf8f2]">{average.toFixed(1)} / 5</span>
        </div>
      ) : (
        <p className="text-xs text-[#7a5c48] dark:text-[#bda393] mb-3">Sé la primera persona en opinar sobre este chocolate.</p>
      )}
      {reviews.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3" aria-label="Lista de opiniones aprobadas">
          {reviews.map((r) => (
            <li key={r.id} className="p-2.5 rounded-xl bg-[#ffffff] dark:bg-[#25130b] border border-[#d4af37]/20">
              <Stars value={r.rating} size="w-3 h-3" />
              {r.comment !== '' && <p className="text-xs text-[#5c4433] dark:text-[#e6d5c3] mt-1 leading-relaxed">{r.comment}</p>}
              {r.createdAt !== '' && (
                <p className="text-[11px] text-[#7a5c48] dark:text-[#a08575] mt-1">{new Date(r.createdAt).toLocaleDateString('es-BO')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {user === null ? (
        <p className="text-xs text-[#7a5c48] dark:text-[#bda393]">Inicia sesión para opinar (solo quienes compraron pueden opinar).</p>
      ) : (
        <div className="p-3 rounded-xl bg-[#ffffff] dark:bg-[#25130b] border border-[#d4af37]/20">
          <p className="text-xs font-bold text-[#2b1a12] dark:text-[#fcf8f2] mb-2">Tu opinión</p>
          <div className="flex items-center gap-1 mb-2" role="radiogroup" aria-label="Tu calificación">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
                onClick={() => setRating(n)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
              >
                <Star className={`w-5 h-5 ${n <= rating ? 'text-[#8a6216] dark:text-[#f1c40f] fill-[#f1c40f]' : 'text-[#6b5546]'}`} />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="¿Qué te pareció? (opcional)"
            aria-label="Tu comentario"
            className="w-full rounded-lg bg-[#faf6ef] dark:bg-[#120a06] border border-[#d4af37]/20 px-2 py-2 text-xs text-[#2b1a12] dark:text-[#fcf8f2] placeholder:text-[#6b5546] mb-2"
          />
          {errorEs !== null && (
            <p role="alert" className="text-xs text-[#b3261e] dark:text-[#f0a6a6] mb-2">
              {errorEs}
            </p>
          )}
          {okMsg !== null && (
            <p role="status" className="text-xs text-[#1e7e34] dark:text-[#a8e6a3] mb-2">
              {okMsg}
            </p>
          )}
          <button
            onClick={() => void submit()}
            disabled={sending}
            className="min-h-[44px] px-4 rounded-xl bg-[#d4af37] text-[#1a0f08] text-xs font-bold disabled:opacity-60 cursor-pointer"
          >
            {sending ? 'Enviando…' : 'Enviar opinión'}
          </button>
        </div>
      )}
    </section>
  );
};
