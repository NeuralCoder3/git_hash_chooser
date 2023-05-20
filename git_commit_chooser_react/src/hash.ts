import { SHA1, enc } from 'crypto-js';

interface CommitValues {
  author_date_timestamp: number;
  author_date_tz: string;
  committer_date_timestamp: number;
  committer_date_tz: string;
}

function git_commit_hash(commit: string): string {
  const object = `commit ${commit.length}\x00${commit}`;
  const sha = SHA1(object).toString();
  return sha;
}

function commit_line_to_format(line: string, aggregate_values: CommitValues): string {
  const format_words: string[] = line.split(/\s+/);
  const length = format_words.length;
  const first_word = format_words[0];
  switch (first_word) {
    case 'author':
      aggregate_values.author_date_timestamp = parseInt(format_words[length - 2]) || 0;
      aggregate_values.author_date_tz = format_words[length - 1];
      format_words[length - 2] = '%(author_date_timestamp)i';
      break;
    case 'committer':
      aggregate_values.committer_date_timestamp = parseInt(format_words[length - 2]) || 0;
      aggregate_values.committer_date_tz = format_words[length - 1];
      format_words[length - 2] = '%(committer_date_timestamp)i';
      break;
    default:
      break;
  }
  return format_words.join(' ');
}

function commit_to_format(commit: string): [string, CommitValues] {
  const aggregate_values: CommitValues = {
    author_date_timestamp: 0,
    author_date_tz: '',
    committer_date_timestamp: 0,
    committer_date_tz: '',
  };
  const commit_lines = commit.split('\n');
  const commit_format = commit_lines
    .map((line) => commit_line_to_format(line, aggregate_values))
    .join('\n');
  return [commit_format, aggregate_values];
}

interface CommitTimes {
  committer: string;
  author: string;
}

export async function find_beautiful_git_hash(
  old_commit: string,
  prefix: string,
  max_minutes: number,
  setProgress: (progress: number) => void
): Promise<CommitTimes | null> {
  const allowed_prefix_chars = '0123456789abcdef';
  if (![...prefix].every((c) => allowed_prefix_chars.includes(c))) {
    throw new Error('Invalid prefix! Only lowercase hex digits are allowed');
  }
  const [commit_format, old_values] = commit_to_format(old_commit);

  const bound = max_minutes * 60;
  const possibilities = (bound + 1) * (bound + 2) / 2;
  const hash_count = allowed_prefix_chars.length ** prefix.length;
  const probability = Math.min(possibilities / hash_count, 0.999);
  console.log(
    `Searching for a hash starting with ${prefix} (1:${hash_count}) in ${possibilities} commits (probability: ${probability.toFixed(
      2
    )}%)`
  );
  let progress = 0;
  const update_iterations =
    Math.max(5000,
      Math.round(possibilities / 100));

  // console.log(`Update iterations: ${update_iterations}`);

  for (let committer_date_offset = 0; committer_date_offset <= bound; committer_date_offset++) {
    // avoid blocking the UI thread
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (
      let author_date_offset = 0;
      author_date_offset <= committer_date_offset;
      author_date_offset++
    ) {
      progress++;
      // setProgress(100 * progress / possibilities);
      // only update ever full percent
      if (progress % update_iterations === 0) {
        setProgress(100 * progress / possibilities);
      }
      const new_values: CommitValues = {
        author_date_timestamp: old_values.author_date_timestamp + author_date_offset,
        author_date_tz: old_values.author_date_tz,
        committer_date_timestamp: old_values.committer_date_timestamp + committer_date_offset,
        committer_date_tz: old_values.committer_date_tz,
      };
      const commit = commit_format
        .replace('%(author_date_timestamp)i', new_values.author_date_timestamp.toString())
        .replace('%(committer_date_timestamp)i', new_values.committer_date_timestamp.toString());
      const sha = git_commit_hash(commit);
      if (sha.startsWith(prefix)) {
        if (author_date_offset === 0 && committer_date_offset === 0) {
          return null;
        } else {
          const committer_date = `${new_values.committer_date_timestamp} ${new_values.committer_date_tz}`;
          const author_date = `${new_values.author_date_timestamp} ${new_values.author_date_tz}`;
          return {
            committer: committer_date,
            author: author_date,
          };
        }
      }
    }
  }

  throw new Error('Unable to find beautiful hash!');
}

// git cat-file commit HEAD
// const old_commit =
//   `tree 42d084115ab8062403bbb93f7434145db1a4676f
// parent 0018a2d7f4d52cdebe903c969f9ee40217b493df
// author Volker Grabsch <vog@notjusthosting.com> 1321287680 +0100
// committer Marcel Ullrich <ullrich@cs.uni-saarland.de> 1321292116 +0100

// Fixed spelling
// `; // Provide the old commit string here
// const prefix = '11'; // Provide the prefix here
// const max_minutes = 10; // Provide the maximum minutes here

// try {
//   const result = find_beautiful_git_hash(old_commit, prefix, max_minutes);
//   if (result) {
//     console.log('Proposal:');
//     console.log(`GIT_COMMITTER_DATE='${result.committer}' git commit --amend -C HEAD --date='${result.author}'`);
//   } else {
//     console.log('Nothing to do');
//   }
// } catch (error) {
//   console.error(error);
// }

