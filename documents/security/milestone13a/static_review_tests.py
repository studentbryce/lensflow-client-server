"""Offline structural checks, not a substitute for real PostgreSQL/RLS tests."""
from pathlib import Path
import unittest
BASE=Path(__file__).resolve().parent
SQL=(BASE/'02_13a_identity_hardening_REVIEW_ONLY.sql').read_text()
class MigrationReview(unittest.TestCase):
    def test_transaction(self):
        self.assertTrue(SQL.strip().startswith('--'))
        self.assertIn('BEGIN;',SQL)
        self.assertTrue(SQL.strip().endswith('COMMIT;'))
    def test_guards_cover_identity_fields(self):
        for field in ['NEW.role IS DISTINCT FROM OLD.role','NEW.user_id IS DISTINCT FROM OLD.user_id',
                      'NEW.client_id IS DISTINCT FROM OLD.client_id',
                      'NEW.photographer_id IS DISTINCT FROM OLD.photographer_id']:
            self.assertIn(field,SQL)
    def test_all_three_triggers(self):
        for table in ['profiles','clients','photographer_profiles']:
            self.assertIn('BEFORE UPDATE ON public.'+table,SQL)
    def test_client_insert_guards(self):
        self.assertIn('AND (SELECT private.is_client())',SQL)
        self.assertIn('AND pp.published = true',SQL)
        self.assertIn('user_id = (SELECT auth.uid())',SQL)
    def test_no_global_role_grants_or_service_role(self):
        self.assertNotIn('GRANT ALL ON TABLE',SQL)
        self.assertNotIn('service_role',SQL)
if __name__=='__main__': unittest.main()
