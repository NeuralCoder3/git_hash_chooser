use kdam::{tqdm, BarExt};
use sha1::Digest;
use std::env;
use std::error::Error;
use std::process::Command;

struct CommitValues {
    author_date_timestamp: i64,
    author_date_tz: String,
    committer_date_timestamp: i64,
    committer_date_tz: String,
}

fn subprocess_check_output(cmd: &str) -> Result<String, Box<dyn Error>> {
    let output = Command::new("sh").arg("-c").arg(cmd).output()?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        Err(format!("Command failed: {}\n{}", cmd, stderr).into())
    }
}

fn load_git_commit(commit_id: &str) -> Result<String, Box<dyn Error>> {
    subprocess_check_output(&format!("git cat-file commit {}", commit_id))
}

fn git_commit_hash(commit: &str) -> String {
    let object = format!("commit {}\x00{}", commit.len(), commit);
    let sha = sha1::Sha1::digest(object.as_bytes());
    format!("{:x}", sha)
}

fn commit_line_to_format(line: &str, aggregate_values: &mut CommitValues) -> String {
    let mut format_words: Vec<&str> = line.split_whitespace().collect();
    let length = format_words.len();
    if let Some(first_word) = format_words.first() {
        match *first_word {
            "author" => {
                aggregate_values.author_date_timestamp =
                    format_words[format_words.len() - 2].parse().unwrap_or(0);
                aggregate_values.author_date_tz = format_words[format_words.len() - 1].to_string();
                format_words[length - 2] = "%(author_date_timestamp)i";
            }
            "committer" => {
                aggregate_values.committer_date_timestamp =
                    format_words[format_words.len() - 2].parse().unwrap_or(0);
                aggregate_values.committer_date_tz =
                    format_words[format_words.len() - 1].to_string();
                format_words[length - 2] = "%(committer_date_timestamp)i";
            }
            _ => {}
        }
    }
    format_words.join(" ")
}

fn commit_to_format(commit: &str) -> Result<(String, CommitValues), Box<dyn Error>> {
    let mut aggregate_values = CommitValues {
        author_date_timestamp: 0,
        author_date_tz: String::new(),
        committer_date_timestamp: 0,
        committer_date_tz: String::new(),
    };
    let commit_format = commit
        // keep final newline
        .split("\n")
        .map(|line| commit_line_to_format(line, &mut aggregate_values))
        .collect::<Vec<String>>()
        .join("\n");
    Ok((commit_format, aggregate_values))
}

fn find_beautiful_git_hash(
    old_commit: &str,
    prefix: &str,
    max_minutes: usize,
) -> Result<Option<(String, String)>, Box<dyn Error>> {
    let allowed_prefix_chars = "0123456789abcdef";
    if !prefix.chars().all(|c| allowed_prefix_chars.contains(c)) {
        return Err("Invalid prefix! Only lower case hex digits are allowed".into());
    }
    let (commit_format, old_values) = commit_to_format(old_commit)?;

    let bound = max_minutes * 60;
    let possibilities = (bound + 1) * (bound + 2) / 2;
    let hash_count = (allowed_prefix_chars.len() as u64).pow(prefix.len() as u32);
    let probability = possibilities as f64 / hash_count as f64;
    println!(
        "Searching for a hash starting with {} (1:{}) in {} commits (probability: {:.2}%)",
        prefix,
        hash_count,
        possibilities,
        100.0 * probability
    );

    let mut bar = tqdm!(total = possibilities as usize);

    for committer_date_offset in 0..=bound {
        for author_date_offset in 0..=committer_date_offset {
            bar.update(1);
            let new_values = CommitValues {
                author_date_timestamp: old_values.author_date_timestamp + author_date_offset as i64,
                author_date_tz: old_values.author_date_tz.clone(),
                committer_date_timestamp: old_values.committer_date_timestamp
                    + committer_date_offset as i64,
                committer_date_tz: old_values.committer_date_tz.clone(),
            };
            let commit = commit_format
                .replace(
                    "%(author_date_timestamp)i",
                    &new_values.author_date_timestamp.to_string(),
                )
                .replace(
                    "%(committer_date_timestamp)i",
                    &new_values.committer_date_timestamp.to_string(),
                );
            if git_commit_hash(&commit).starts_with(prefix) {
                if author_date_offset == 0 && committer_date_offset == 0 {
                    return Ok(None);
                } else {
                    let committer_date = format!(
                        "{} {}",
                        new_values.committer_date_timestamp, new_values.committer_date_tz
                    );
                    let author_date = format!(
                        "{} {}",
                        new_values.author_date_timestamp, new_values.author_date_tz
                    );
                    return Ok(Some((committer_date, author_date)));
                }
            }
        }
    }
    eprint!("\n");

    Err("Unable to find beautiful hash!".into())
}

fn proposed_prefix(previous_commit: &str, number_length: usize) -> String {
    let output = subprocess_check_output(&format!("git rev-parse {} 2>/dev/null", previous_commit))
        .unwrap_or_default();
    let previous_commit_hash = output.trim_end();
    let new_number = previous_commit_hash[..number_length]
        .parse::<u64>()
        .map(|n| n + 1)
        .unwrap_or(1);
    format!("{:0>width$}a", new_number, width = number_length)
}

fn show_proposal_for_git_head(prefix: Option<String>) -> Result<(), Box<dyn Error>> {
    let prefix = prefix.unwrap_or_else(|| proposed_prefix("HEAD^", 4));
    let old_commit = load_git_commit("HEAD")?;
    let values = find_beautiful_git_hash(&old_commit, &prefix, 300)?;

    if let Some((committer_date, author_date)) = values {
        println!("Proposal:");
        println!(
            "GIT_COMMITTER_DATE='{}' git commit --amend -C HEAD --date='{}'",
            committer_date, author_date
        );
    } else {
        println!("Nothing to do");
    }

    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().collect();

    match args.get(1).map(String::as_str) {
        Some("--auto") => show_proposal_for_git_head(None)?,
        Some(prefix) => show_proposal_for_git_head(Some(prefix.to_string()))?,
        _ => {
            println!("Usage");
            println!("    {} <prefix>|--auto", args[0]);
            std::process::exit(1);
        }
    }

    Ok(())
}
