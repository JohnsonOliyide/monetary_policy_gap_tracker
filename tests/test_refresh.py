import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch
import pandas as pd

spec = importlib.util.spec_from_file_location('update', Path(__file__).resolve().parents[1] / 'scripts/update_data.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

class RefreshTests(unittest.TestCase):
    def test_quoted_header_after_preamble(self):
        frame = u.read_noted_csv(b'Explanatory note\n"date","rate"\n2020-01-01,1.5\n', {'date', 'rate'})
        self.assertEqual(frame['rate'].iloc[0], 1.5)

    def test_missing_month_is_not_compressed(self):
        series = pd.Series([1., 3.], index=pd.to_datetime(['2020-01-01', '2020-03-01']))
        result = u.month_end_index(series)
        self.assertEqual(len(result), 3)
        self.assertTrue(pd.isna(result.iloc[1]))

    def test_incomplete_quarter_is_not_a_full_quarter_average(self):
        series = pd.Series([100., 102., 103.], index=pd.to_datetime(['2020-10-01', '2020-12-01', '2021-01-01']))
        result = u.quarter_end_index(series, min_observations=3)
        self.assertTrue(result.isna().all())

    def test_lagged_proxy_includes_next_available_period(self):
        series = pd.Series(range(100, 114), index=pd.date_range('2020-01-31', periods=14, freq='ME'))
        result = u.moving_average_proxy(series, 12)
        self.assertEqual(result.index[-1], pd.Timestamp('2021-03-31'))
        self.assertTrue(pd.notna(result.iloc[-1]))

    def test_source_failure_preserves_published_data(self):
        with patch.object(u, 'build_records', return_value={'months':[{}], 'quarters':[{}]}), patch.dict(u.LOG, {'errors':[], 'warnings':['source unavailable']}), patch.object(u.Path, 'write_text') as write:
            with self.assertRaises(RuntimeError): u.main()
            write.assert_not_called()

if __name__ == '__main__': unittest.main()
