-- Add email and phone fields to beneficiarios table
ALTER TABLE beneficiarios 
ADD COLUMN email text,
ADD COLUMN telefono text;