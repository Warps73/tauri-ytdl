import { useState } from 'react';
import { MantineProvider, Container, TextInput, Button, Paper, Title, Text, Stack, Group, Select } from '@mantine/core';
import { IconDownload, IconBrandYoutube } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { invoke } from "@tauri-apps/api/core";
import { download } from '@tauri-apps/plugin-upload';


function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('mp4');
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!url) {
      notifications.show({
        title: 'Error',
        message: 'Please enter a YouTube URL',
        color: 'red',
      });
      return;
    }

    try {
      setDownloading(true);
      await invoke("download_music", { url :url, format :format })
      notifications.show({
        title: 'Success',
        message: 'Video downloaded successfully!',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to download video',
        color: 'red',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <MantineProvider>
      <Container size="sm" py="xl">
        <Paper shadow="md" p="xl" radius="md">
          <Stack spacing="lg">
            <Group align="center" justify="center">
              <IconBrandYoutube size={40} color="red" />
              <Title order={1}>YouTube Downloader</Title>
            </Group>
            
            <Text c="dimmed" ta="center">
              Enter a YouTube URL to download videos in your preferred format
            </Text>

            <TextInput
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              size="lg"
              leftSection={<IconBrandYoutube size={20} />}
            />

            <Select
              label="Format"
              value={format}
              onChange={setFormat}
              data={[
                { value: 'mp4', label: 'MP4 Video' },
                { value: 'mp3', label: 'MP3 Audio' },
                { value: 'wav', label: 'WAV Audio' },
              ]}
            />

            <Button
              size="lg"
              leftSection={<IconDownload size={20} />}
              loading={downloading}
              onClick={handleDownload}
              variant="gradient"
              gradient={{ from: 'red', to: 'orange' }}
            >
              {downloading ? 'Downloading...' : 'Download'}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </MantineProvider>
  );
}

export default App;
