-- Almacén de vídeos propios de los ejercicios (pestaña Ejercicios del entrenador).
-- Cómo usarlo: Supabase > SQL Editor > New query, pega todo esto y pulsa Run. Solo hace falta una vez.
-- Lectura pública (los clientes ven los vídeos en su rutina); solo el entrenador (is_admin) sube, cambia o borra.
-- Límite: 50 MB por vídeo (.mp4, .mov o .webm).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

create policy "videos: subir (entrenador)" on storage.objects
  for insert to authenticated with check (bucket_id = 'videos' and public.is_admin());
create policy "videos: cambiar (entrenador)" on storage.objects
  for update to authenticated using (bucket_id = 'videos' and public.is_admin()) with check (bucket_id = 'videos' and public.is_admin());
create policy "videos: borrar (entrenador)" on storage.objects
  for delete to authenticated using (bucket_id = 'videos' and public.is_admin());
