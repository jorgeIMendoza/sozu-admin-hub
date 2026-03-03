-- Create the firmas-digitales storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('firmas-digitales', 'firmas-digitales', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read files
CREATE POLICY "Authenticated users can read firmas-digitales"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'firmas-digitales');

-- Allow service role (edge functions) to upload
CREATE POLICY "Service role can upload to firmas-digitales"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'firmas-digitales');

CREATE POLICY "Service role can update firmas-digitales"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'firmas-digitales');