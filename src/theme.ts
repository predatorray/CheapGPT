import { createTheme } from '@mui/material/styles';
export const theme = createTheme({
  palette: {
    primary: { main: '#304e3a', contrastText: '#fff' },
    background: { default: '#faf9f6', paper: '#fffefa' },
    text: { primary: '#292d27', secondary: '#7b7e74' },
    divider: '#e6e6de',
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: { textTransform: 'none', fontWeight: 500 },
    fontSize: 14,
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiDialog: { styleOverrides: { paper: { backgroundImage: 'none', borderRadius: 20 } } },
    MuiChip: { styleOverrides: { root: { fontSize: 12 } } },
  },
});
