'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSignal } from '@/lib/api/signals';

const schema = z.object({
  signal_date: z.string().min(1),
  race_type: z.enum(['JRA', 'NAR']),
  jo_code: z.string().min(1),
  race_no: z.coerce.number().min(1).max(12),
  bet_type: z.coerce.number(),
  method: z.coerce.number().default(301),
  suggested_amount: z.coerce.number().min(100),
  kaime_data: z.string().min(1),
  note: z.string().optional(),
});

type SignalForm = z.infer<typeof schema>;

export default function CreateSignalPage() {
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<SignalForm>({
    resolver: zodResolver<SignalForm>(schema),
    defaultValues: {
      signal_date: new Date().toISOString().split('T')[0],
      race_type: 'JRA',
      jo_code: '05',
      race_no: 11,
      bet_type: 8,
      method: 301,
      suggested_amount: 1000,
    },
  });

  const onSubmit = async (values: SignalForm) => {
    setError('');
    setSuccess('');
    const kaimeArray = values.kaime_data
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const { error } = await createSignal({
      ...values,
      kaime_data: kaimeArray,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess('買い目を配信しました');
    reset({ ...values, kaime_data: '' });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">買い目配信</h1>
            <p className="text-sm text-gray-500">レース情報を入力し配信します</p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            戻る
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {success && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl bg-white p-6 shadow">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="開催日" error={errors.signal_date?.message}>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  {...register('signal_date')}
                />
              </Field>
              <Field label="種別" error={errors.race_type?.message}>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  {...register('race_type')}
                >
                  <option value="JRA">JRA</option>
                  <option value="NAR">NAR</option>
                </select>
              </Field>
              <Field label="競馬場" error={errors.jo_code?.message}>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  {...register('jo_code')}
                >
                  <option value="05">東京</option>
                  <option value="06">中山</option>
                  <option value="09">阪神</option>
                </select>
              </Field>
              <Field label="レース番号" error={errors.race_no?.message}>
                <input
                  type="number"
                  min={1}
                  max={12}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  {...register('race_no')}
                />
              </Field>
              <Field label="馬券種類" error={errors.bet_type?.message}>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  {...register('bet_type')}
                >
                  <option value={1}>単勝</option>
                  <option value={4}>馬連</option>
                  <option value={6}>馬単</option>
                  <option value={7}>3連複</option>
                  <option value={8}>3連単</option>
                </select>
              </Field>
              <Field label="フォーメーション/方式" error={errors.method?.message}>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  {...register('method')}
                />
              </Field>
              <Field label="推奨金額" error={errors.suggested_amount?.message}>
                <input
                  type="number"
                  step={100}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  {...register('suggested_amount')}
                />
              </Field>
            </div>

            <Field label="買い目（1行1目）" error={errors.kaime_data?.message}>
              <textarea
                rows={6}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                {...register('kaime_data')}
                placeholder={'1-2-3\n4-5-6'}
              />
            </Field>

            <Field label="メモ" error={errors.note?.message}>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                {...register('note')}
                placeholder="本命◎1番軸の流し"
              />
            </Field>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? '配信中...' : '配信する'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <div className="mt-1">
        {children}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  );
}
