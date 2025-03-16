import { useState } from 'react';
import { MantineProvider, Container, TextInput, Button, Paper, Title, Text, Stack, Group, Select, Alert } from '@mantine/core';
import { IconDownload, IconBrandYoutube, IconCheck, IconFolder, IconFile } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir, openPath } from '@tauri-apps/plugin-opener';
import { open } from '@tauri-apps/plugin-shell';

// Fonction pour formater le chemin du fichier
const formatFilePath = (path) => {
  try {
    // Extrait juste le nom du fichier du chemin complet
    const fileName = path.split(/[/\\]/).pop();
    // Décode les caractères spéciaux
    return decodeURIComponent(fileName);
  } catch (e) {
    return path;
  }
};

function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('audio');
  const [downloading, setDownloading] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState(null);

  const handleDownload = async () => {
    if (!url) {
      notifications.show({
        title: 'Erreur',
        message: 'Veuillez entrer une URL YouTube',
        color: 'red',
      });
      return;
    }

    try {
      setDownloading(true);
      setDownloadedFile(null);
      const filePath = await invoke("download_music", { url, format });

      setDownloadedFile(filePath);
      notifications.show({
        title: 'Succès',
        message: 'Musique téléchargée avec succès !',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: 'Erreur',
        message: error || 'Échec du téléchargement',
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
              Entrez une URL YouTube pour télécharger la musique
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
                { value: 'audio', label: 'Audio' },
                { value: 'video', label: 'Video' },
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
              {downloading ? 'Téléchargement en cours...' : 'Télécharger'}
            </Button>

            {downloadedFile && (
              <Alert title="Téléchargement réussi" color="green" icon={<IconCheck size={16} />}>
                <Stack spacing="xs">
                  <Text>Fichier : {formatFilePath(downloadedFile)}</Text>
                  <Text size="sm" c="dimmed">Dossier : {downloadedFile.substring(0, downloadedFile.lastIndexOf(formatFilePath(downloadedFile)))}</Text>
                  <Group mt="sm">
                    <Button 
                      variant="light" 
                      size="sm"
                      leftSection={<IconFile size={16} />}
                      onClick={() => open(downloadedFile)}
                    >
                      Ouvrir le fichier
                    </Button>
                    <Button 
                      variant="light" 
                      size="sm"
                      leftSection={<IconFolder size={16} />}
                      onClick={() => revealItemInDir(downloadedFile)}
                    >
                      Localiser le fichier
                    </Button>
                  </Group>
                </Stack>
              </Alert>
            )}
          </Stack>
        </Paper>
      </Container>
    </MantineProvider>
  );
}

export default App;
