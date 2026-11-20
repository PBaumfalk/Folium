import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCan, useSession } from '../App';
import { ErrorBox, fmtDate, Loading, useToast } from '../components/ui';
import { api, type PageView } from '../lib/api';

export function TrashPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const canEdit = useCan('editor');
  const { trashDays } = useSession();
  const q = useQuery({ queryKey: ['trash'], queryFn: () => api.get<PageView[]>('/api/v1/trash') });
  const restore = useMutation({
    mutationFn: (id: number) => api.post<PageView>(`/api/v1/pages/${id}/restore`),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['trash'] });
      void qc.invalidateQueries({ queryKey: ['pages'] });
      toast({ text: `„${p.name}“ wiederhergestellt${p.published ? ' und wieder öffentlich' : ''}.` });
    },
    onError: (e) => toast({ text: (e as Error).message, kind: 'bad' }),
  });
  return (
    <>
      <div className="head">
        <div>
          <h1 className="title">Papierkorb</h1>
          <p className="sub">Gelöschte Seiten bleiben {trashDays} Tage erhalten und werden danach endgültig entfernt.</p>
        </div>
      </div>
      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.data?.length === 0 && (
        <div className="empty">
          <h2>Der Papierkorb ist leer</h2>
          <p>Hier landen Seiten, die Sie löschen. Sie lassen sich {trashDays} Tage lang wiederherstellen.</p>
        </div>
      )}
      {!!q.data?.length && (
        <div className="card" style={{ padding: 0 }}>
          <table className="t">
            <thead>
              <tr>
                <th>Seite</th>
                <th>Adresse</th>
                <th>Gelöscht</th>
                <th>
                  <span className="sr">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td>/{p.slug}</td>
                  <td>{fmtDate(p.deletedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {canEdit && (
                      <button className="btn sm" onClick={() => restore.mutate(p.id)} disabled={restore.isPending}>
                        Wiederherstellen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
