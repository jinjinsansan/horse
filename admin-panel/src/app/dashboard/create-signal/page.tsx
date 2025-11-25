'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import Link from 'next/link';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSignal } from '@/lib/api/signals';
import { JRA_JO_CODES, NAR_JO_CODES, BET_TYPES } from '@horsebet/shared/types/business.types';

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
  const [raceType, setRaceType] = useState<'JRA' | 'NAR'>('JRA');
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
  } = useForm<SignalForm>({
    resolver: zodResolver(schema) as Resolver<SignalForm>,
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

  // race_typeの変更を監視
  const currentRaceType = watch('race_type');
  if (currentRaceType !== raceType) {
    setRaceType(currentRaceType);
    // race_typeが変わったら、最初の競馬場を選択
    const firstCode = currentRaceType === 'JRA' 
      ? Object.keys(JRA_JO_CODES)[0] 
      : Object.keys(NAR_JO_CODES)[0];
    setValue('jo_code', firstCode);
  }

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
                  {raceType === 'JRA' 
                    ? Object.entries(JRA_JO_CODES).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))
                    : Object.entries(NAR_JO_CODES).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))
                  }
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
                  {Object.entries(BET_TYPES).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
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
              <div className="mb-2 text-xs text-gray-600">
                <p className="font-medium mb-1">入力形式：</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>単勝・複勝: 馬番のみ（例: 1）</li>
                  <li>馬連・馬単・ワイド: 馬番-馬番（例: 1-2）</li>
                  <li>3連複・3連単: 馬番-馬番-馬番（例: 1-2-3）</li>
                  <li>複数の買い目: 1行に1目ずつ入力</li>
                </ul>
              </div>
              <textarea
                rows={6}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                {...register('kaime_data')}
                placeholder={'1-2-3\n4-5-6\n7-8-9'}
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
