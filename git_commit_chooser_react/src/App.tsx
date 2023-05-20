import React from 'react';
import './App.css';
import { find_beautiful_git_hash } from './hash';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress, {
  CircularProgressProps,
} from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

function CircularProgressWithLabel(
  props: CircularProgressProps & { value: number },
) {
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress variant="determinate" {...props} />
      <Box
        sx={{
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="caption"
          component="div"
          color="text.secondary"
        >{`${Math.round(props.value)}%`}</Typography>
      </Box>
    </Box>
  );
}



function App() {
  const [minutes, setMinutes] = React.useState<number>(60);
  const [prefix, setPrefix] = React.useState<string>('1234');
  // const [info, setInfo] = React.useState<string>('');
  const [commitString, setCommitString] = React.useState<string>('')

  const hash_count = 16 ** prefix.length;
  const bound = minutes * 60;
  const possibilities = (bound + 1) * (bound + 2) / 2;
  const probability = Math.min(0.999, possibilities / hash_count);
  const percentage = Math.round(probability * 10000) / 100;
  const info =
    `Searching for a hash with chance 1 in ${hash_count} over ${possibilities} possibilities, which is a ${percentage}% chance of finding one.`

  const [command, setCommand] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');
  const [progress, setProgress] = React.useState<number | undefined>(undefined);

  const findHash = async () => {
    // console.log('findHash');
    // await wait(1000);
    try {
      const result = await find_beautiful_git_hash(commitString, prefix, minutes, setProgress);
      console.log(result);
      if (result) {
        setError('');
        setCommand(`GIT_COMMITTER_DATE='${result.committer}' git commit --amend -C HEAD --date='${result.author}'`)
      } else {
        setCommand('');
        setError("Hash already starts with the specified prefix.");
      }
    } catch (e) {
      setCommand('');
      setError((e as Error).message);
    }
    // console.log('findHash2');
    setProgress(undefined);
  };

  return (
    <div className="App">

      <Box
        component="form"
        sx={{
          '& .MuiTextField-root': { m: 1, width: '25ch' },
          '& .MuiAlert-root': { m: 1, width: '52ch', margin: 'auto' },
        }}
        // noValidate
        autoComplete="off"
      >
        <TextField
          // required
          id="outlined-required"
          label="Minutes"

          value={minutes}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (isNaN(value)) {
              setMinutes(0)
            } else {
              setMinutes(value)
            }
          }}
        />
        <TextField
          // required
          id="outlined-required"
          label="Prefix"
          value={prefix}
          onChange={(e) => {
            const value = e.target.value;
            setPrefix(value)
          }}
        />
        {
          info.length > 0 &&
          <>
            <Alert severity="info">{info}</Alert>
          </>
        }
        <br />
        Run `git cat-file commit HEAD` to get the info:
        <br />
        <TextField
          required
          multiline
          id="outlined-required"
          label="Commit Info"
          value={commitString}
          onChange={(e) => {
            const value = e.target.value;
            setCommitString(value)
          }}
          rows={7}
          style={{ width: '52ch' }}
          placeholder={
            `tree [hash]
parent [hash]
author [name] <[email]> [timestamp] [timezone]
committer [name] <[email]> [timestamp] [timezone]

[message]
\\n`
          }
        />

        <br />

        <Button variant="contained" onClick={async () => {
          if (!commitString.endsWith('\n')) {
            setError('Commit info must end with a newline.')
            return;
          }
          setProgress(0);
          setError('');
          setCommand('');
          // run findHash in a separate thread
          // setTimeout(findHash, 100);
          findHash();
          // new Promise((resolve, reject) => {
          //   findHash();
          //   resolve("done");
          // }).then((value) => {
          //   console.log(value);
          //   setProgress(undefined);
          // });
        }}>Find Hash</Button>

        {
          progress !== undefined ?
            <>
              <br />
              <CircularProgressWithLabel value={progress} />
            </>
            :
            (
              error.length > 0 ?
                <Alert severity="error">{error}</Alert>
                :
                command.length > 0 &&
                <Alert severity="success">{command}</Alert>
            )
        }
      </Box>


    </div>
  );
}

export default App;
